"""
Session management for protocol-driven data acquisition.
Controls the entire data acquisition lifecycle with predefined movements.
"""

import time
from datetime import datetime
from typing import List, Optional, Dict, Callable, Any, Tuple
from enum import Enum
import numpy as np

from protocol import ClinicalProtocol, MovementProtocol, MovementType
from trial import Trial, TrialMetadata, FrameData
from biomechanics import BiomechanicalFeatureExtractor


class SessionState(Enum):
    """States of the data acquisition session."""
    INITIALIZING = "initializing"
    CALIBRATING = "calibrating"
    READY = "ready"
    INSTRUCTION = "instruction"
    COUNTDOWN = "countdown"
    RECORDING = "recording"
    HOLDING = "holding"
    RESTING = "resting"
    COMPLETED = "completed"
    ERROR = "error"


class InstructionEngine:
    """Manages patient instructions synchronized with recording logic."""

    def __init__(self, display_callback: Optional[Callable[[str], None]] = None):
        """
        Initialize instruction engine.

        Args:
            display_callback: Function to call for displaying instructions
        """
        self.display_callback = display_callback
        self.countdown_start_time: Optional[float] = None
        self.countdown_duration: int = 0
        self.current_countdown: int = 0

    def show_instruction(self, instruction: str):
        """Display instruction to patient."""
        if self.display_callback:
            self.display_callback(instruction)
        else:
            print(f"INSTRUCTION: {instruction}")

    def start_countdown(self, seconds: int, current_time: float):
        """Start countdown timer (non-blocking)."""
        self.countdown_start_time = current_time
        self.countdown_duration = seconds
        self.current_countdown = seconds

    def update_countdown(self, current_time: float) -> Optional[int]:
        """
        Update countdown based on current time.
        Returns remaining seconds, or None if countdown complete.
        """
        if self.countdown_start_time is None:
            return None

        elapsed = current_time - self.countdown_start_time
        remaining = max(0, self.countdown_duration - int(elapsed))

        if remaining != self.current_countdown:
            self.current_countdown = remaining
            if self.display_callback:
                if remaining > 0:
                    self.display_callback(f"Get ready... {remaining}")
                else:
                    self.display_callback("Starting now...")

        if remaining == 0:
            self.countdown_start_time = None
            return None

        return remaining

    def is_countdown_active(self) -> bool:
        """Check if countdown is currently active."""
        return self.countdown_start_time is not None

    def show_complete(self):
        """Indicate movement is complete."""
        if self.display_callback:
            # Generic completion message; the session logic will then show
            # "Let's move on with the next movement" after each trial.
            self.display_callback("Movement complete.")
        else:
            print("Movement complete.")


class DataAcquisitionSession:
    """
    Manages a complete data acquisition session following a predefined protocol.
    Controls the entire lifecycle from calibration to completion.
    """

    def __init__(
        self,
        patient_id: str,
        session_id: str,
        affected_hand: str = "right",
        output_dir: str = "Hand_Movement_data"
    ):
        """
        Initialize a new data acquisition session.

        Args:
            patient_id: Unique patient identifier
            session_id: Unique session identifier
            affected_hand: "left" or "right"
            output_dir: Directory to save trial data
        """
        self.patient_id = patient_id
        self.session_id = session_id
        self.affected_hand = affected_hand
        self.output_dir = output_dir

        # Protocol
        self.protocol = ClinicalProtocol()
        self.current_movement_index = 0
        self.current_trial_number: Dict[MovementType, int] = {}

        # State management
        self.state = SessionState.INITIALIZING
        self.session_start_time = None
        self.current_trial: Optional[Trial] = None
        self.trials: List[Trial] = []

        # Baseline data
        self.baseline_angles: Optional[Dict[str, float]] = None
        self.baseline_trial: Optional[Trial] = None

        # Feature extractor
        self.feature_extractor = BiomechanicalFeatureExtractor(smoothing_window=7)

        # Instruction engine
        self.instruction_engine = InstructionEngine()
        # Instruction timing
        self.instruction_read_duration: float = 4.0  # seconds to read instruction before countdown
        self.instruction_read_start_time: Optional[float] = None
        # After a failed trial, we briefly show a reassurance message before advancing
        self.skip_message_until: Optional[float] = None
        self.last_trial_valid: Optional[bool] = None
        # Retry mechanism: when validation fails, show retry message then restart movement
        self.retry_message_until: Optional[float] = None
        self.pending_retry: bool = False

        # Timing
        self.movement_start_time: Optional[float] = None
        self.hold_start_time: Optional[float] = None
        self.rest_start_time: Optional[float] = None

        # Session-level storage (one atomic buffer for aggregated trial rows)
        # Each element is a flat dict with metadata + window-level aggregated features
        self.session_rows: List[Dict[str, Any]] = []
        # Monotonic session timestamp tracking
        self.last_timestamp: Optional[float] = None

        # Acceleration percentile tracking for categorization (updated as trials complete)
        self.all_accelerations: List[float] = []  # Store all acceleration magnitudes for percentile computation

        # Movement validation thresholds (full-movement reference values).
        # For classification, a movement is considered "correct" if it reaches
        # at least 50% of these thresholds.
        self.validation_thresholds = {
            "rom_close": 30.0,  # degrees
            "rom_open": 40.0,
            "velocity_min": 5.0,  # deg/s
            "lateral_displacement": 0.1,  # normalized units
            "wrist_angle_change": 20.0,  # degrees
            "rotation_velocity": 10.0,  # deg/s
            "target_finger_rom": 25.0,  # degrees
            "isolation_ratio_max": 0.5,  # non-target / target movement ratio
        }

        # Feature columns used for clustering (continuous only; metadata excluded)
        self.clustering_feature_columns: List[str] = [
            "rom_index_mcp",
            "rom_middle_mcp",
            "rom_thumb_mcp",
            "mean_velocity",
            "peak_velocity",
            "velocity_variance",
            "mean_palm_acceleration",
            "mean_dominant_finger_acceleration",
            "mean_non_target_acceleration",
            "finger_correlation_score",
            "unintended_activation_ratio",
            "stability_score",
            "tremor_index",
            "smoothness_index",
        ]

        # Callbacks
        self.state_change_callback: Optional[Callable[[SessionState], None]] = None
        self.instruction_callback: Optional[Callable[[str], None]] = None

    def set_instruction_callback(self, callback: Callable[[str], None]):
        """Set callback for displaying instructions."""
        self.instruction_engine.display_callback = callback
        self.instruction_callback = callback

    def set_state_change_callback(self, callback: Callable[[SessionState], None]):
        """Set callback for state changes."""
        self.state_change_callback = callback

    def start_session(self):
        """Start the data acquisition session."""
        self.session_start_time = time.time()
        # After external hand-in-view initialization, the session starts in READY
        # and the first movement will be triggered by the main loop.
        self.state = SessionState.READY
        self._notify_state_change()

        # Reset trial numbers
        for movement in self.protocol.movements:
            self.current_trial_number[movement.movement_type] = 0
        # Reset session-level storage
        self.session_rows = []
        self.last_timestamp = None

    def get_current_movement(self) -> Optional[MovementProtocol]:
        """Get the current movement protocol."""
        return self.protocol.get_movement_by_index(self.current_movement_index)

    def get_progress(self) -> Dict[str, Any]:
        """Get current session progress."""
        total_movements = len(self.protocol.movements)
        return {
            "current_movement": self.current_movement_index + 1,
            "total_movements": total_movements,
            "progress_percent": (self.current_movement_index / total_movements) * 100,
            "trials_completed": len(self.trials),
            "state": self.state.value
        }

    def start_calibration(self, current_time: Optional[float] = None):
        """Start baseline calibration phase."""
        if current_time is None:
            current_time = time.time() - self.session_start_time

        movement = self.protocol.get_movement_by_index(0)
        if movement is None or movement.movement_type != MovementType.BASELINE_REST:
            raise ValueError("First movement must be baseline rest")

        self.state = SessionState.INSTRUCTION
        self._notify_state_change()

        # Show instruction
        self.instruction_engine.show_instruction(movement.instruction)

        # Start countdown (non-blocking)
        self.state = SessionState.COUNTDOWN
        self._notify_state_change()
        self.instruction_engine.start_countdown(3, current_time)

    def process_frame(
        self,
        landmarks: Optional[List],
        hand_confidence: float,
        timestamp: Optional[float] = None
    ) -> bool:
        """
        Process a frame during active recording.
        Returns True if session should continue, False if complete.
        """
        if timestamp is None:
            timestamp = time.time() - self.session_start_time

        # Enforce strictly increasing timestamps (no duplicates)
        if self.last_timestamp is not None and timestamp <= self.last_timestamp:
            timestamp = self.last_timestamp + 1e-6
        self.last_timestamp = timestamp

        # Check hand detection quality
        if landmarks is None or hand_confidence < 0.5:
            # Low confidence - flag but continue
            if self.current_trial and self.state == SessionState.RECORDING:
                # Add frame with low confidence
                frame_data = self._create_frame_data(landmarks, hand_confidence, timestamp)
                if frame_data:
                    self.current_trial.add_frame(frame_data)
            return True

        # Handle countdown state
        if self.state == SessionState.COUNTDOWN:
            remaining = self.instruction_engine.update_countdown(timestamp)
            if remaining is None:
                # Countdown complete, start recording
                movement = self.get_current_movement()
                if movement:
                    self.state = SessionState.RECORDING
                    self._notify_state_change()
                    self._start_trial(movement)
            return True

        # Process based on current state
        if self.state == SessionState.RECORDING:
            return self._process_recording_frame(landmarks, hand_confidence, timestamp)
        elif self.state == SessionState.HOLDING:
            return self._process_holding_frame(landmarks, hand_confidence, timestamp)
        elif self.state == SessionState.RESTING:
            return self._process_resting_frame(timestamp)
        elif self.state == SessionState.INSTRUCTION:
            # Instruction reading phase or post-fallback skip message
            # 1) If we're waiting to advance after a trial (with or without rest)
            if self.skip_message_until is not None:
                if timestamp >= self.skip_message_until:
                    # Time to move on to the next movement
                    self.skip_message_until = None
                    return self._start_next_movement_or_complete()
                return True

            # 2) If we're showing a retry message after validation failure
            if self.pending_retry and self.retry_message_until is not None:
                if timestamp >= self.retry_message_until:
                    # Retry message time expired, restart the same movement
                    self.retry_message_until = None
                    self.pending_retry = False
                    movement = self.get_current_movement()
                    if movement:
                        self.instruction_engine.show_instruction(movement.instruction)
                        self.instruction_read_start_time = timestamp
                    return True
                return True

            # 3) Normal instruction reading period before countdown
            if self.instruction_read_start_time is None:
                self.instruction_read_start_time = timestamp
                return True

            elapsed = timestamp - self.instruction_read_start_time
            if elapsed >= self.instruction_read_duration:
                # Transition to countdown
                self.state = SessionState.COUNTDOWN
                self._notify_state_change()
                # Give extra time with a longer countdown
                self.instruction_engine.start_countdown(5, timestamp)
            return True
        elif self.state == SessionState.READY:
            # Waiting for next movement
            return True
        else:
            return True

    def _process_recording_frame(
        self,
        landmarks: List,
        hand_confidence: float,
        timestamp: float
    ) -> bool:
        """Process frame during movement recording phase."""
        if self.current_trial is None:
            return True

        # Create frame data
        frame_data = self._create_frame_data(landmarks, hand_confidence, timestamp)
        if frame_data:
            self.current_trial.add_frame(frame_data)
            # Note: We no longer append per-frame; we'll compute aggregated features at trial completion

        # Check if movement duration is complete
        movement = self.get_current_movement()
        if movement is None:
            return False

        elapsed = timestamp - self.movement_start_time
        if elapsed >= movement.duration_seconds:
            # Transition to hold phase
            if movement.hold_duration_seconds > 0:
                self.state = SessionState.HOLDING
                self._notify_state_change()
                self.hold_start_time = timestamp
            else:
                # No hold, finish trial and either rest or move to next movement
                self._complete_trial()
                return self._start_rest_phase_or_next()

        return True

    def _process_holding_frame(
        self,
        landmarks: List,
        hand_confidence: float,
        timestamp: float
    ) -> bool:
        """Process frame during hold phase."""
        if self.current_trial is None:
            return True

        frame_data = self._create_frame_data(landmarks, hand_confidence, timestamp)
        if frame_data:
            self.current_trial.add_frame(frame_data)
            # Note: We no longer append per-frame; we'll compute aggregated features at trial completion

        movement = self.get_current_movement()
        if movement is None:
            return False

        elapsed = timestamp - self.hold_start_time
        if elapsed >= movement.hold_duration_seconds:
            # Hold complete, finish trial and either rest or move to next movement
            self._complete_trial()
            return self._start_rest_phase_or_next()

        return True

    def _process_resting_frame(self, timestamp: float) -> bool:
        """Process frame during rest phase."""
        movement = self.get_current_movement()
        if movement is None:
            return False

        elapsed = timestamp - self.rest_start_time
        if elapsed >= movement.rest_after_seconds:
            # Rest complete, advance to next movement or complete session
            return self._start_next_movement_or_complete()

        return True

    def _create_frame_data(
        self,
        landmarks: Optional[List],
        hand_confidence: float,
        timestamp: float
    ) -> Optional[FrameData]:
        """Create FrameData from landmarks."""
        if landmarks is None:
            return None

        # Calculate angles
        angles = self.feature_extractor.calculate_finger_angles(landmarks)

        # Normalize relative to baseline
        if self.baseline_angles:
            angles = self.feature_extractor.normalize_angles(angles, self.baseline_angles)

        # Compute derivatives
        velocities, accelerations = self.feature_extractor.compute_derivatives(angles, timestamp)

        # Create frame data
        frame_data = FrameData(
            timestamp=timestamp,
            angles=angles,
            angular_velocities=velocities,
            angular_accelerations=accelerations,
            landmarks=landmarks,  # Optional, for debugging
            hand_confidence=hand_confidence
        )

        return frame_data

    def _start_trial(self, movement: MovementProtocol):
        """Start a new trial for the given movement."""
        # Increment trial number for this movement type
        self.current_trial_number[movement.movement_type] += 1
        trial_num = self.current_trial_number[movement.movement_type]

        # Create metadata
        metadata = TrialMetadata(
            patient_id=self.patient_id,
            session_id=self.session_id,
            affected_hand=self.affected_hand,
            movement_type=movement.movement_type,
            movement_name=movement.name,
            sub_instruction=movement.sub_instruction,
            trial_number=trial_num,
            timestamp=datetime.now(),
            duration_seconds=0.0,  # Will be updated on completion
            frame_count=0,  # Will be updated on completion
            baseline_angles=self.baseline_angles.copy() if self.baseline_angles else None
        )

        # Create trial
        self.current_trial = Trial(metadata)
        self.movement_start_time = time.time() - self.session_start_time

        # Reset feature extractor for new trial
        self.feature_extractor.reset()

    def _complete_trial(self):
        """
        Complete the current trial with movement validation and aggregated feature computation.

        Movement completion requires BOTH:
        1. Minimum duration satisfied (handled by state machine)
        2. Motion validation satisfied (checked here)

        If validation fails: show message, don't increment trial_index, don't save.
        If validation passes: compute aggregated features, append ONE row to session dataset.
        """
        if self.current_trial is None:
            return

        # First check basic trial quality (frame count, confidence)
        basic_valid = self.current_trial.validate()
        if not basic_valid:
            print(f"Trial failed basic validation: {self.current_trial.validation_errors}")
            self.last_trial_valid = False
            self.current_trial = None
            return

        # Now validate actual meaningful motion occurred
        movement_valid, validation_message = self._validate_movement()

        if not movement_valid:
            # Movement not detected / insufficient (<50% of thresholds).
            # Classify as incorrect. Message shown in _start_rest_phase_or_next.
            self.last_trial_valid = False
            movement = self.get_current_movement()
            if movement:
                self.current_trial_number[movement.movement_type] -= 1
            print(f"Movement validation failed: {validation_message}")
            self.current_trial = None
            return

        # Movement validated - compute aggregated features and save
        self.last_trial_valid = True

        # Compute window features for internal use
        self.current_trial.compute_window_features(self.baseline_angles)

        # Update metadata
        self.current_trial.metadata.duration_seconds = self.current_trial.get_duration()
        self.current_trial.metadata.frame_count = self.current_trial.get_frame_count()

        # Store baseline angles if this is baseline trial
        if self.current_trial.metadata.movement_type == MovementType.BASELINE_REST:
            if self.current_trial.window_features:
                self.baseline_angles = self.current_trial.window_features.mean_angles.copy()
                self.baseline_trial = self.current_trial

        # Add to trials list
        self.trials.append(self.current_trial)

        # Compute aggregated window-level features and append ONE row to session dataset
        aggregated_row = self._compute_trial_aggregated_features()
        if aggregated_row:
            self.session_rows.append(aggregated_row)

            print(
                f"Trial completed: {self.current_trial.metadata.movement_name} "
                f"(Trial {self.current_trial.metadata.trial_number})"
            )

        self.current_trial = None

    def _validate_movement(self) -> Tuple[bool, str]:
        """
        Validate that meaningful motion occurred during the trial.

        Returns:
            (is_valid, message) tuple
        """
        if self.current_trial is None or not self.current_trial.frames:
            return False, "No frames recorded"

        movement = self.get_current_movement()
        if movement is None:
            return False, "No movement protocol"

        # Extract angle arrays for analysis
        angle_arrays: Dict[str, List[float]] = {}
        velocity_arrays: Dict[str, List[float]] = {}

        for frame in self.current_trial.frames:
            for key, value in frame.angles.items():
                if key not in angle_arrays:
                    angle_arrays[key] = []
                angle_arrays[key].append(value)

            for key, value in frame.angular_velocities.items():
                if key not in velocity_arrays:
                    velocity_arrays[key] = []
                velocity_arrays[key].append(abs(value))

        # Convert to numpy for easier computation
        angle_arrays_np = {k: np.array(v) for k, v in angle_arrays.items()}
        velocity_arrays_np = {k: np.array(v) for k, v in velocity_arrays.items()}

        movement_type = movement.movement_type.value

        # Helper to compute 50%-of-threshold based checks
        def _meets_50_percent(actual: float, threshold_key: str) -> Tuple[bool, float]:
            """Return (ok, required) where ok=True if actual >= 50% of configured threshold."""
            full = self.validation_thresholds[threshold_key]
            required = 0.5 * full
            return actual >= required, required

        # Movement-specific validation rules
        if movement_type == "fist_close":
            # Use max ROM across index, middle, thumb for robustness
            rom_index = np.max(angle_arrays_np.get("index_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("index_mcp", np.array([0]))
            )
            rom_middle = np.max(angle_arrays_np.get("middle_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("middle_mcp", np.array([0]))
            )
            rom_thumb = np.max(angle_arrays_np.get("thumb_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("thumb_mcp", np.array([0]))
            )
            rom_best = max(rom_index, rom_middle, rom_thumb)
            all_mcp_vels = []
            for k in velocity_arrays_np:
                if "mcp" in k:
                    all_mcp_vels.extend(velocity_arrays_np[k])
            mean_vel = float(np.mean(all_mcp_vels)) if all_mcp_vels else 0.0

            ok_rom, required_rom = _meets_50_percent(rom_best, "rom_close")
            if not ok_rom:
                return False, f"ROM too small: {rom_best:.1f} < {required_rom:.1f} (50% of target)"
            ok_vel, required_vel = _meets_50_percent(mean_vel, "velocity_min")
            if not ok_vel:
                return False, f"Velocity too low: {mean_vel:.1f} < {required_vel:.1f} (50% of target)"

        elif movement_type == "finger_sequence_prep":
            # Same as fist_close: expect finger flexion
            rom_index = np.max(angle_arrays_np.get("index_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("index_mcp", np.array([0]))
            )
            rom_middle = np.max(angle_arrays_np.get("middle_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("middle_mcp", np.array([0]))
            )
            rom_best = max(rom_index, rom_middle)
            ok_rom, required_rom = _meets_50_percent(rom_best, "rom_close")
            if not ok_rom:
                return False, f"ROM too small: {rom_best:.1f} < {required_rom:.1f} (50% of target)"

        elif movement_type == "fist_open":
            # Use max ROM across index, middle, thumb for robustness
            rom_index = np.max(angle_arrays_np.get("index_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("index_mcp", np.array([0]))
            )
            rom_middle = np.max(angle_arrays_np.get("middle_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("middle_mcp", np.array([0]))
            )
            rom_thumb = np.max(angle_arrays_np.get("thumb_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("thumb_mcp", np.array([0]))
            )
            rom_best = max(rom_index, rom_middle, rom_thumb)
            ok_rom, required_rom = _meets_50_percent(rom_best, "rom_open")
            if not ok_rom:
                return False, f"ROM too small: {rom_best:.1f} < {required_rom:.1f} (50% of target)"

        elif movement_type == "hand_wave_lr":
            # Check lateral palm displacement (simplified: use wrist angle change)
            wrist_rom = np.max(angle_arrays_np.get("wrist_angle", np.array([0]))) - np.min(
                angle_arrays_np.get("wrist_angle", np.array([0]))
            )
            # For wave, we expect significant wrist angle variation.
            scaled_threshold = self.validation_thresholds["lateral_displacement"] * 100.0
            required = 0.5 * scaled_threshold
            if wrist_rom < required:
                return False, f"Lateral motion too small: {wrist_rom:.1f} < {required:.1f} (50% of target)"

        elif movement_type == "palm_up_down":
            wrist_rom = np.max(angle_arrays_np.get("wrist_angle", np.array([0]))) - np.min(
                angle_arrays_np.get("wrist_angle", np.array([0]))
            )
            ok_rom, required_rom = _meets_50_percent(wrist_rom, "wrist_angle_change")
            if not ok_rom:
                return (
                    False,
                    f"Wrist angle change too small: {wrist_rom:.1f} < {required_rom:.1f} (50% of target)",
                )

        elif movement_type == "fist_rotation_fast":
            # Check for rotational motion (use combined finger velocities)
            all_velocities = []
            for key in velocity_arrays_np:
                if "mcp" in key:
                    all_velocities.extend(velocity_arrays_np[key])
            if all_velocities:
                peak_vel = np.max(all_velocities)
                ok_vel, required_vel = _meets_50_percent(peak_vel, "rotation_velocity")
                if not ok_vel:
                    return (
                        False,
                        f"Rotation velocity too low: {peak_vel:.1f} < {required_vel:.1f} (50% of target)",
                    )
            else:
                return False, "No velocity data for rotation"

        elif movement_type.startswith("finger_seq_"):
            # Finger isolation task
            target_finger = movement.target_finger if hasattr(movement, "target_finger") else None
            if target_finger:
                target_key = f"{target_finger}_mcp"
                target_rom = float(
                    np.max(angle_arrays_np.get(target_key, np.array([0])))
                    - np.min(angle_arrays_np.get(target_key, np.array([0])))
                )
                ok_rom, required_rom = _meets_50_percent(target_rom, "target_finger_rom")
                if not ok_rom:
                    return (
                        False,
                        f"Target finger ROM too small: {target_rom:.1f} < {required_rom:.1f} (50% of target)",
                    )

                # Check unintended activation (non-target fingers should move less)
                non_target_fingers = ["thumb", "index", "middle", "ring", "pinky"]
                if target_finger in non_target_fingers:
                    non_target_fingers.remove(target_finger)
                non_target_movements = []
                for finger in non_target_fingers:
                    key = f"{finger}_mcp"
                    if key in angle_arrays_np:
                        rom = np.max(angle_arrays_np[key]) - np.min(angle_arrays_np[key])
                        non_target_movements.append(rom)
                if non_target_movements and target_rom > 0:
                    avg_non_target = float(np.mean(non_target_movements))
                    unintended_ratio = avg_non_target / target_rom
                    max_ratio = self.validation_thresholds["isolation_ratio_max"]
                    allowed = 0.5 * max_ratio
                    if unintended_ratio > allowed:
                        return (
                            False,
                            f"Unintended activation too high: {unintended_ratio:.2f} > {allowed:.2f} (50% of max allowed)",
                        )

        # Default: if no specific rule, check for any significant motion
        if not angle_arrays_np:
            return False, "No angle data"

        # Check if there's any meaningful change at all
        max_rom = 0.0
        for values in angle_arrays_np.values():
            rom = np.max(values) - np.min(values)
            max_rom = max(max_rom, rom)

        # Global minimal ROM threshold (very lenient): require at least 50% of 5 degrees
        # so that small camera noise is not classified as valid movement.
        if max_rom < 2.5:
            return False, f"Overall ROM too small: {max_rom:.1f} < 2.5 (50% of minimal threshold)"

        return True, "Movement validated"

    def _compute_trial_aggregated_features(self) -> Optional[Dict[str, Any]]:
        """
        Compute window-level aggregated features for a completed trial.
        Returns a single row dict with all required features.
        """
        if self.current_trial is None or not self.current_trial.frames:
            return None

        movement = self.get_current_movement()
        if movement is None:
            return None

        # Extract arrays
        angle_arrays: Dict[str, List[float]] = {}
        velocity_arrays: Dict[str, List[float]] = {}
        acceleration_arrays: Dict[str, List[float]] = {}

        for frame in self.current_trial.frames:
            for key, value in frame.angles.items():
                if key not in angle_arrays:
                    angle_arrays[key] = []
                angle_arrays[key].append(value)

            for key, value in frame.angular_velocities.items():
                if key not in velocity_arrays:
                    velocity_arrays[key] = []
                velocity_arrays[key].append(value)

            for key, value in frame.angular_accelerations.items():
                if key not in acceleration_arrays:
                    acceleration_arrays[key] = []
                acceleration_arrays[key].append(abs(value))

        angle_arrays_np = {k: np.array(v) for k, v in angle_arrays.items()}
        velocity_arrays_np = {k: np.array(v) for k, v in velocity_arrays.items()}
        acceleration_arrays_np = {k: np.array(v) for k, v in acceleration_arrays.items()}

        # Build aggregated row with mandatory metadata
        movement_id = self.current_movement_index + 1
        movement_name = movement.movement_type.value
        instruction_phase = movement.sub_instruction if movement.sub_instruction else movement.name
        trial_index = self.current_trial_number.get(movement.movement_type, 0)
        trial_timestamp = (
            self.current_trial.metadata.timestamp.timestamp()
            if hasattr(self.current_trial.metadata.timestamp, "timestamp")
            else time.time()
        )
        session_relative_timestamp = trial_timestamp - self.session_start_time if self.session_start_time else 0.0

        row: Dict[str, Any] = {
            "session_id": self.session_id,
            "movement_id": movement_id,
            "movement_name": movement_name,
            "instruction_phase": instruction_phase,
            "trial_index": trial_index,
            "timestamp": session_relative_timestamp,
            "patient_id": self.patient_id,
            "affected_hand": self.affected_hand,
            "duration_seconds": self.current_trial.metadata.duration_seconds,
            "frame_count": self.current_trial.metadata.frame_count,
        }

        # 1. Range of Motion (ROM)
        rom_index_mcp = float(
            np.max(angle_arrays_np.get("index_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("index_mcp", np.array([0]))
            )
        )
        rom_middle_mcp = float(
            np.max(angle_arrays_np.get("middle_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("middle_mcp", np.array([0]))
            )
        )
        rom_thumb_mcp = float(
            np.max(angle_arrays_np.get("thumb_mcp", np.array([0]))) - np.min(
                angle_arrays_np.get("thumb_mcp", np.array([0]))
            )
        )

        row["rom_index_mcp"] = rom_index_mcp
        row["rom_middle_mcp"] = rom_middle_mcp
        row["rom_thumb_mcp"] = rom_thumb_mcp

        # 2. Velocity features
        all_velocities = []
        for values in velocity_arrays_np.values():
            all_velocities.extend(np.abs(values).tolist())

        if all_velocities:
            row["mean_velocity"] = float(np.mean(all_velocities))
            row["peak_velocity"] = float(np.max(all_velocities))
            row["velocity_variance"] = float(np.var(all_velocities))
        else:
            row["mean_velocity"] = 0.0
            row["peak_velocity"] = 0.0
            row["velocity_variance"] = 0.0

        # 3. Acceleration features (continuous means)
        all_accel_magnitudes = []
        for values in acceleration_arrays_np.values():
            all_accel_magnitudes.extend(values.tolist())

        if all_accel_magnitudes:
            # Update session-wide acceleration list (kept for potential diagnostics)
            self.all_accelerations.extend(all_accel_magnitudes)

            # Continuous mean accelerations
            palm_accel = float(np.mean(acceleration_arrays_np.get("wrist_angle", np.array([0.0]))))
            row["mean_palm_acceleration"] = palm_accel

            # Dominant finger acceleration (use index MCP)
            dominant_accel = float(np.mean(acceleration_arrays_np.get("index_mcp", np.array([0.0]))))
            row["mean_dominant_finger_acceleration"] = dominant_accel

            # Non-target acceleration (average of other fingers)
            non_target_keys = [k for k in acceleration_arrays_np.keys() if "index" not in k and "wrist" not in k]
            if non_target_keys:
                non_target_accels = [float(np.mean(acceleration_arrays_np[k])) for k in non_target_keys]
                non_target_accel = float(np.mean(non_target_accels))
            else:
                non_target_accel = 0.0
            row["mean_non_target_acceleration"] = non_target_accel
        else:
            row["mean_palm_acceleration"] = 0.0
            row["mean_dominant_finger_acceleration"] = 0.0
            row["mean_non_target_acceleration"] = 0.0

        # 4. Synergy metrics
        finger_names = ["thumb", "index", "middle", "ring", "pinky"]
        mcp_angles = {}
        for finger in finger_names:
            key = f"{finger}_mcp"
            if key in angle_arrays_np:
                mcp_angles[finger] = angle_arrays_np[key]

        # Compute pairwise correlations
        correlations = []
        finger_list = list(mcp_angles.keys())
        for i, finger1 in enumerate(finger_list):
            for finger2 in finger_list[i + 1 :]:
                if len(mcp_angles[finger1]) == len(mcp_angles[finger2]) and len(mcp_angles[finger1]) > 1:
                    corr = np.corrcoef(mcp_angles[finger1], mcp_angles[finger2])[0, 1]
                    if not np.isnan(corr):
                        correlations.append(abs(corr))

        if correlations:
            row["finger_correlation_score"] = float(np.mean(correlations))
        else:
            row["finger_correlation_score"] = 0.0

        # Unintended activation ratio (for isolation tasks)
        finger_rom_map = {
            "index": rom_index_mcp,
            "middle": rom_middle_mcp,
            "thumb": rom_thumb_mcp,
            "ring": float(
                np.max(angle_arrays_np.get("ring_mcp", np.array([0])))
                - np.min(angle_arrays_np.get("ring_mcp", np.array([0])))
            ),
            "pinky": float(
                np.max(angle_arrays_np.get("pinky_mcp", np.array([0])))
                - np.min(angle_arrays_np.get("pinky_mcp", np.array([0])))
            ),
        }
        if getattr(movement, "target_finger", None):
            target_rom = finger_rom_map.get(movement.target_finger, rom_index_mcp)
            non_target_fingers = ["thumb", "index", "middle", "ring", "pinky"]
            if movement.target_finger in non_target_fingers:
                non_target_fingers.remove(movement.target_finger)
            non_target_roms = [finger_rom_map.get(f, 0.0) for f in non_target_fingers]
            if non_target_roms and target_rom > 0:
                avg_non_target = float(np.mean(non_target_roms))
                row["unintended_activation_ratio"] = avg_non_target / target_rom
            else:
                row["unintended_activation_ratio"] = 0.0
        else:
            row["unintended_activation_ratio"] = 0.0

        # 5. Smoothness/stability
        # Stability score = inverse of angle variance during hold phase
        hold_start_idx = int(len(self.current_trial.frames) * 0.6)
        if hold_start_idx < len(self.current_trial.frames):
            hold_angles = {}
            for key in angle_arrays_np:
                hold_values = angle_arrays_np[key][hold_start_idx:]
                if len(hold_values) > 1:
                    hold_angles[key] = hold_values

            if hold_angles:
                variances = [float(np.var(v)) for v in hold_angles.values()]
                mean_variance = float(np.mean(variances))
                row["stability_score"] = 1.0 / (1.0 + mean_variance)  # Inverse, bounded
            else:
                row["stability_score"] = 0.0
        else:
            row["stability_score"] = 0.0

        # Tremor index = high-frequency oscillation energy
        # Simplified: use variance of second derivative (acceleration)
        if acceleration_arrays_np:
            tremor_values = []
            for values in acceleration_arrays_np.values():
                tremor_values.extend(values.tolist())
            row["tremor_index"] = float(np.var(tremor_values))
        else:
            row["tremor_index"] = 0.0

        # Smoothness index = normalized jerk metric
        # Jerk is third derivative; we approximate using acceleration change rate
        if len(self.current_trial.frames) > 2:
            jerk_values = []
            accel_list = []
            for frame in self.current_trial.frames:
                accel_mag = sum(abs(v) for v in frame.angular_accelerations.values())
                accel_list.append(accel_mag)

            if len(accel_list) > 1:
                jerk = np.diff(accel_list)
                jerk_magnitude = np.sum(np.abs(jerk))
                duration = self.current_trial.metadata.duration_seconds
                if duration > 0:
                    row["smoothness_index"] = 1.0 / (1.0 + jerk_magnitude / duration)  # Normalized, higher = smoother
                else:
                    row["smoothness_index"] = 0.0
            else:
                row["smoothness_index"] = 0.0
        else:
            row["smoothness_index"] = 0.0

        return row

    def _start_rest_phase_or_next(self) -> bool:
        """
        After a trial is completed, either enter a rest phase (if configured)
        or immediately advance to the next movement.
        """
        movement = self.get_current_movement()
        if movement and movement.rest_after_seconds > 0:
            # Enter rest phase
            self.state = SessionState.RESTING
            self._notify_state_change()
            self.rest_start_time = time.time() - self.session_start_time
            # Single message for all trials
            self.instruction_engine.show_instruction("Let's move on with the next movement.")
            return True

        # No rest configured, go directly to next movement
        return self._start_next_movement_or_complete()

    def _start_next_movement_or_complete(self) -> bool:
        """Advance to the next movement in the protocol, or complete the session."""
        # Move to next movement index
        self.current_movement_index += 1

        if self.current_movement_index >= len(self.protocol.movements):
            # Session complete
            self.state = SessionState.COMPLETED
            self._notify_state_change()
            return False

        # Start next movement
        return self._start_next_movement()

    def start_next_movement(self, current_time: Optional[float] = None) -> bool:
        """Start the next movement in the protocol."""
        if current_time is None:
            current_time = time.time() - self.session_start_time

        movement = self.get_current_movement()
        if movement is None:
            return False

        # Show instruction and enter instruction reading phase
        self.state = SessionState.INSTRUCTION
        self._notify_state_change()
        self.instruction_engine.show_instruction(movement.instruction)
        # Reset reading timer for this instruction
        self.instruction_read_start_time = current_time

        return True

    def _start_next_movement(self) -> bool:
        """Internal method to start next movement (for backward compatibility)."""
        return self.start_next_movement()

    def _notify_state_change(self):
        """Notify callback of state change."""
        if self.state_change_callback:
            self.state_change_callback(self.state)

    def save_session(self):
        """
        Save the entire session as a single CSV file.

        Core storage principle:
            - One session -> one file (no exceptions)
            - All movements and phases coexist in this file, distinguished by metadata.
        """
        import os
        import pandas as pd
        import numpy as np

        if not self.session_rows:
            print("\nNo session data to save (session_rows is empty).")
            return

        os.makedirs(self.output_dir, exist_ok=True)

        # Build DataFrame and ensure ordering by timestamp
        df = pd.DataFrame(self.session_rows)
        if "timestamp" in df.columns:
            df = df.sort_values(by="timestamp").reset_index(drop=True)

        # ------------------------------------------------------------------
        # K-Means clustering compatibility validation (continuous only)
        # ------------------------------------------------------------------
        # 1) Remove any legacy categorical columns if they exist
        categorical_cols = [
            "rom_index_mcp_category",
            "rom_middle_mcp_category",
            "rom_thumb_mcp_category",
            "palm_accel_level",
            "dominant_finger_accel_level",
            "non_target_accel_level",
            "synergy_level",
        ]
        existing_categoricals = [c for c in categorical_cols if c in df.columns]
        if existing_categoricals:
            print("\nDropping legacy categorical columns not suitable for K-Means:")
            print(f"  {existing_categoricals}")
            df = df.drop(columns=existing_categoricals)

        # 2) Ensure all clustering feature columns exist and are numeric floats
        for col in self.clustering_feature_columns:
            if col not in df.columns:
                df[col] = 0.0

        for col in self.clustering_feature_columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype(float)
            # Replace inf / -inf with NaN, then fill with 0.0 for numerical stability
            df[col] = df[col].replace([np.inf, -np.inf], np.nan)
            df[col] = df[col].fillna(0.0)

        # 3) Sanity check: all clustering columns must be numeric
        non_numeric_cols = [
            col
            for col in self.clustering_feature_columns
            if not np.issubdtype(df[col].dtype, np.number)
        ]
        if non_numeric_cols:
            print(
                "\nWARNING: The following clustering feature columns are not numeric "
                f"and may break K-Means: {non_numeric_cols}"
            )

        # 4) Print feature summary statistics for quick inspection
        print("\nClustering feature summary statistics:")
        try:
            print(df[self.clustering_feature_columns].describe().to_string())
        except Exception as e:
            print(f"Could not compute summary statistics: {e}")

        # Derive simple summary statistics
        total_rows = len(df)
        num_movements = df["movement_id"].nunique() if "movement_id" in df.columns else 0
        duration = float(df["timestamp"].max() - df["timestamp"].min()) if total_rows > 1 else 0.0

        # Single session-level file name
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = os.path.join(
            self.output_dir,
            f"session_{self.session_id}_{timestamp_str}.csv"
        )

        df.to_csv(filename, index=False)

        print(f"\nSession file saved: {filename}")
        print(f"Total rows: {total_rows}")
        print(f"Number of movements: {num_movements}")
        print(f"Session duration (approx): {duration:.2f} seconds")
