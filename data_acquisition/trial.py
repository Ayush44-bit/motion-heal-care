"""
Trial-based data structure for storing movement attempts.
Each trial represents one complete attempt of a specific movement.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any
import numpy as np
from datetime import datetime
from protocol import MovementType


@dataclass
class FrameData:
    """Data for a single frame within a trial."""
    timestamp: float  # Relative to trial start
    angles: Dict[str, float]  # Joint angles in degrees
    angular_velocities: Dict[str, float]  # First derivative (deg/s)
    angular_accelerations: Dict[str, float]  # Second derivative (deg/s²)
    landmarks: Optional[List] = None  # Optional raw landmarks for debugging
    hand_confidence: float = 1.0  # MediaPipe confidence score


@dataclass
class TrialMetadata:
    """Structured metadata for a trial."""
    patient_id: str
    session_id: str
    affected_hand: str  # "left" or "right"
    movement_type: MovementType
    movement_name: str
    trial_number: int  # Which attempt of this movement (1-indexed)
    timestamp: datetime
    duration_seconds: float
    frame_count: int
    sub_instruction: Optional[str] = None  # For sub-steps like individual finger openings
    baseline_angles: Optional[Dict[str, float]] = None  # For normalization


@dataclass
class WindowFeatures:
    """Window-level aggregated features computed from trial frames."""
    # Angle statistics
    mean_angles: Dict[str, float]
    std_angles: Dict[str, float]
    min_angles: Dict[str, float]
    max_angles: Dict[str, float]
    range_of_motion: Dict[str, float]  # max - min
    
    # Velocity statistics
    mean_velocities: Dict[str, float]
    peak_velocity: Dict[str, float]
    velocity_variance: Dict[str, float]
    
    # Acceleration statistics
    mean_accelerations: Dict[str, float]
    peak_acceleration: Dict[str, float]
    
    # Stability metrics (for static holds)
    angle_stability: Dict[str, float]  # Coefficient of variation during hold
    hold_stability_score: float  # Overall stability during hold phase
    
    # Synergy metrics
    finger_correlations: Dict[str, float]  # Correlation between finger angles
    isolation_score: Optional[float] = None  # For isolation tasks
    synergy_index: float = 0.0  # Overall synergy measure


class Trial:
    """Represents one complete movement attempt."""
    
    def __init__(self, metadata: TrialMetadata):
        """Initialize a new trial."""
        self.metadata = metadata
        self.frames: List[FrameData] = []
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.window_features: Optional[WindowFeatures] = None
        self.is_valid: bool = True
        self.validation_errors: List[str] = []
    
    def add_frame(self, frame_data: FrameData):
        """Add a frame to this trial."""
        if self.start_time is None:
            self.start_time = frame_data.timestamp
        
        self.frames.append(frame_data)
        self.end_time = frame_data.timestamp
    
    def get_duration(self) -> float:
        """Get trial duration in seconds."""
        if self.start_time is None or self.end_time is None:
            return 0.0
        return self.end_time - self.start_time
    
    def get_frame_count(self) -> int:
        """Get number of frames in trial."""
        return len(self.frames)
    
    def compute_window_features(self, baseline_angles: Optional[Dict[str, float]] = None) -> WindowFeatures:
        """
        Compute window-level aggregated features from trial frames.
        This is called immediately after trial completion.
        """
        if not self.frames:
            raise ValueError("Cannot compute features from empty trial")
        
        # Extract angle arrays for each joint
        angle_arrays: Dict[str, List[float]] = {}
        velocity_arrays: Dict[str, List[float]] = {}
        acceleration_arrays: Dict[str, List[float]] = {}
        
        # Get all angle keys from first frame
        if self.frames:
            angle_keys = list(self.frames[0].angles.keys())
        else:
            angle_keys = []
        
        for key in angle_keys:
            angle_arrays[key] = []
            velocity_arrays[key] = []
            acceleration_arrays[key] = []
        
        # Collect data from all frames
        for frame in self.frames:
            for key in angle_keys:
                angle_arrays[key].append(frame.angles.get(key, 0.0))
                velocity_arrays[key].append(frame.angular_velocities.get(key, 0.0))
                acceleration_arrays[key].append(frame.angular_accelerations.get(key, 0.0))
        
        # Convert to numpy arrays for computation
        angle_arrays_np = {k: np.array(v) for k, v in angle_arrays.items()}
        velocity_arrays_np = {k: np.array(v) for k, v in velocity_arrays.items()}
        acceleration_arrays_np = {k: np.array(v) for k, v in acceleration_arrays.items()}
        
        # Compute statistics
        mean_angles = {k: float(np.mean(v)) for k, v in angle_arrays_np.items()}
        std_angles = {k: float(np.std(v)) for k, v in angle_arrays_np.items()}
        min_angles = {k: float(np.min(v)) for k, v in angle_arrays_np.items()}
        max_angles = {k: float(np.max(v)) for k, v in angle_arrays_np.items()}
        range_of_motion = {k: max_angles[k] - min_angles[k] for k in angle_keys}
        
        mean_velocities = {k: float(np.mean(np.abs(v))) for k, v in velocity_arrays_np.items()}
        peak_velocity = {k: float(np.max(np.abs(v))) for k, v in velocity_arrays_np.items()}
        velocity_variance = {k: float(np.var(v)) for k, v in velocity_arrays_np.items()}
        
        mean_accelerations = {k: float(np.mean(np.abs(v))) for k, v in acceleration_arrays_np.items()}
        peak_acceleration = {k: float(np.max(np.abs(v))) for k, v in acceleration_arrays_np.items()}
        
        # Stability metrics (coefficient of variation during hold phase)
        # Use last 40% of frames as "hold phase"
        hold_start_idx = int(len(self.frames) * 0.6)
        angle_stability = {}
        hold_angles = {}
        
        for key in angle_keys:
            if hold_start_idx < len(angle_arrays_np[key]):
                hold_values = angle_arrays_np[key][hold_start_idx:]
                mean_val = np.mean(hold_values)
                std_val = np.std(hold_values)
                # Coefficient of variation
                angle_stability[key] = float(std_val / mean_val) if mean_val != 0 else 0.0
                hold_angles[key] = hold_values
            else:
                angle_stability[key] = 0.0
                hold_angles[key] = angle_arrays_np[key]
        
        # Overall hold stability (lower is better)
        hold_stability_score = float(np.mean([angle_stability[k] for k in angle_keys]))
        
        # Synergy metrics (correlation between finger angles)
        finger_correlations = self._compute_finger_correlations(angle_arrays_np)
        
        # Isolation score (for isolation tasks)
        isolation_score = None
        if self.metadata.movement_type.value.startswith("index") or \
           self.metadata.movement_type.value.startswith("middle") or \
           self.metadata.movement_type.value.startswith("ring") or \
           self.metadata.movement_type.value.startswith("pinky"):
            isolation_score = self._compute_isolation_score(angle_arrays_np, self.metadata.movement_type)
        
        # Overall synergy index (higher = more synergy)
        synergy_index = self._compute_synergy_index(finger_correlations)
        
        self.window_features = WindowFeatures(
            mean_angles=mean_angles,
            std_angles=std_angles,
            min_angles=min_angles,
            max_angles=max_angles,
            range_of_motion=range_of_motion,
            mean_velocities=mean_velocities,
            peak_velocity=peak_velocity,
            velocity_variance=velocity_variance,
            mean_accelerations=mean_accelerations,
            peak_acceleration=peak_acceleration,
            angle_stability=angle_stability,
            hold_stability_score=hold_stability_score,
            finger_correlations=finger_correlations,
            isolation_score=isolation_score,
            synergy_index=synergy_index
        )
        
        return self.window_features
    
    def _compute_finger_correlations(self, angle_arrays: Dict[str, np.ndarray]) -> Dict[str, float]:
        """Compute correlation between finger joint angle trajectories."""
        finger_names = ['thumb', 'index', 'middle', 'ring', 'pinky']
        correlations = {}
        
        # Get MCP angles for each finger
        mcp_angles = {}
        for finger in finger_names:
            key = f"{finger}_mcp"
            if key in angle_arrays:
                mcp_angles[finger] = angle_arrays[key]
        
        # Compute pairwise correlations
        finger_list = list(mcp_angles.keys())
        for i, finger1 in enumerate(finger_list):
            for finger2 in finger_list[i+1:]:
                if len(mcp_angles[finger1]) == len(mcp_angles[finger2]):
                    corr = np.corrcoef(mcp_angles[finger1], mcp_angles[finger2])[0, 1]
                    if not np.isnan(corr):
                        correlations[f"{finger1}_{finger2}"] = float(corr)
        
        return correlations
    
    def _compute_isolation_score(self, angle_arrays: Dict[str, np.ndarray], movement_type: MovementType) -> float:
        """
        Compute isolation score for finger isolation tasks.
        Lower score = better isolation (less movement in non-target fingers).
        """
        # Determine target finger
        target_finger = None
        if "index" in movement_type.value:
            target_finger = "index"
        elif "middle" in movement_type.value:
            target_finger = "middle"
        elif "ring" in movement_type.value:
            target_finger = "ring"
        elif "pinky" in movement_type.value:
            target_finger = "pinky"
        
        if target_finger is None:
            return 0.0
        
        # Compute movement magnitude for target finger
        target_key = f"{target_finger}_mcp"
        if target_key not in angle_arrays:
            return 0.0
        
        target_movement = np.std(angle_arrays[target_key])
        
        # Compute movement magnitude for non-target fingers
        non_target_fingers = ['thumb', 'index', 'middle', 'ring', 'pinky']
        non_target_fingers.remove(target_finger)
        
        non_target_movements = []
        for finger in non_target_fingers:
            key = f"{finger}_mcp"
            if key in angle_arrays:
                non_target_movements.append(np.std(angle_arrays[key]))
        
        if not non_target_movements:
            return 0.0
        
        avg_non_target_movement = np.mean(non_target_movements)
        
        # Isolation score: ratio of non-target to target movement
        # Lower is better (0 = perfect isolation)
        if target_movement > 0:
            isolation_score = avg_non_target_movement / target_movement
        else:
            isolation_score = 1.0  # No target movement
        
        return float(isolation_score)
    
    def _compute_synergy_index(self, finger_correlations: Dict[str, float]) -> float:
        """
        Compute overall synergy index from finger correlations.
        Higher value = more synergy (fingers move together).
        """
        if not finger_correlations:
            return 0.0
        
        # Average of absolute correlations
        avg_corr = np.mean([abs(v) for v in finger_correlations.values()])
        return float(avg_corr)
    
    def validate(self, min_frames: int = 10, min_confidence: float = 0.5) -> bool:
        """
        Validate trial data quality.
        Returns True if valid, False otherwise.
        """
        self.validation_errors = []
        self.is_valid = True
        
        # Check frame count
        if len(self.frames) < min_frames:
            self.validation_errors.append(f"Insufficient frames: {len(self.frames)} < {min_frames}")
            self.is_valid = False
        
        # Check confidence scores
        low_confidence_frames = sum(1 for f in self.frames if f.hand_confidence < min_confidence)
        if low_confidence_frames > len(self.frames) * 0.2:  # More than 20% low confidence
            self.validation_errors.append(f"Too many low-confidence frames: {low_confidence_frames}/{len(self.frames)}")
            self.is_valid = False
        
        # Check for dropouts (missing frames)
        if len(self.frames) > 1:
            timestamps = [f.timestamp for f in self.frames]
            time_diffs = np.diff(timestamps)
            avg_diff = np.mean(time_diffs)
            large_gaps = sum(1 for d in time_diffs if d > avg_diff * 3)
            if large_gaps > len(time_diffs) * 0.1:  # More than 10% large gaps
                self.validation_errors.append(f"Too many temporal gaps detected: {large_gaps}")
                self.is_valid = False
        
        return self.is_valid

