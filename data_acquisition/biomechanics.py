"""
Biomechanical feature computation module.
Computes joint angles, angular velocities, and angular accelerations.
"""

import numpy as np
from typing import List, Dict, Optional, Tuple
from collections import deque


class BiomechanicalFeatureExtractor:
    """Extracts biomechanical features from hand landmarks."""
    
    def __init__(self, smoothing_window: int = 5):
        """
        Initialize feature extractor.
        
        Args:
            smoothing_window: Number of frames for temporal smoothing
        """
        self.smoothing_window = smoothing_window
        self.angle_history: Dict[str, deque] = {}
        self.velocity_history: Dict[str, deque] = {}
        self.timestamp_history: deque = deque(maxlen=smoothing_window)
        
        # Initialize angle keys
        self.angle_keys = [
            'thumb_cmc', 'thumb_mcp', 'thumb_ip',
            'index_mcp', 'index_pip', 'index_dip',
            'middle_mcp', 'middle_pip', 'middle_dip',
            'ring_mcp', 'ring_pip', 'ring_dip',
            'pinky_mcp', 'pinky_pip', 'pinky_dip',
            'wrist_angle'
        ]
        
        for key in self.angle_keys:
            self.angle_history[key] = deque(maxlen=smoothing_window)
            self.velocity_history[key] = deque(maxlen=smoothing_window)
    
    def calculate_joint_angle(self, point1: np.ndarray, point2: np.ndarray, point3: np.ndarray) -> float:
        """
        Calculate the angle between three points (in degrees).
        point2 is the vertex of the angle.
        """
        # Convert to numpy arrays
        p1 = np.array(point1)
        p2 = np.array(point2)
        p3 = np.array(point3)
        
        # Calculate vectors
        v1 = p1 - p2
        v2 = p3 - p2
        
        # Avoid division by zero
        norm1 = np.linalg.norm(v1)
        norm2 = np.linalg.norm(v2)
        
        if norm1 < 1e-6 or norm2 < 1e-6:
            return 0.0
        
        # Calculate angle using dot product
        cos_angle = np.dot(v1, v2) / (norm1 * norm2)
        cos_angle = np.clip(cos_angle, -1.0, 1.0)  # Clamp to avoid numerical errors
        angle_rad = np.arccos(cos_angle)
        angle_deg = np.degrees(angle_rad)
        
        return angle_deg
    
    def calculate_finger_angles(self, landmarks: List) -> Dict[str, float]:
        """Calculate joint angles for each finger."""
        # Convert landmarks to numpy array for easier indexing
        if len(landmarks) < 21:
            return {key: 0.0 for key in self.angle_keys}
        
        lm = np.array([[landmark.x, landmark.y, landmark.z] for landmark in landmarks])
        
        angles = {}
        
        # Thumb angles (CMC, MCP, IP joints)
        # Thumb CMC angle (wrist, CMC, MCP)
        angles['thumb_cmc'] = self.calculate_joint_angle(lm[0], lm[2], lm[3])
        # Thumb MCP angle (CMC, MCP, IP)
        angles['thumb_mcp'] = self.calculate_joint_angle(lm[2], lm[3], lm[4])
        # Thumb IP angle (MCP, IP, tip) - approximate using MCP-IP vector
        if len(lm) > 4:
            ip_vector = lm[4] - lm[3]
            tip_extension = lm[4] + ip_vector * 0.1  # Small extension
            angles['thumb_ip'] = self.calculate_joint_angle(lm[3], lm[4], tip_extension)
        else:
            angles['thumb_ip'] = 0.0
        
        # Index finger angles (MCP, PIP, DIP)
        angles['index_mcp'] = self.calculate_joint_angle(lm[0], lm[5], lm[6])
        angles['index_pip'] = self.calculate_joint_angle(lm[5], lm[6], lm[7])
        angles['index_dip'] = self.calculate_joint_angle(lm[6], lm[7], lm[8])
        
        # Middle finger angles
        angles['middle_mcp'] = self.calculate_joint_angle(lm[0], lm[9], lm[10])
        angles['middle_pip'] = self.calculate_joint_angle(lm[9], lm[10], lm[11])
        angles['middle_dip'] = self.calculate_joint_angle(lm[10], lm[11], lm[12])
        
        # Ring finger angles
        angles['ring_mcp'] = self.calculate_joint_angle(lm[0], lm[13], lm[14])
        angles['ring_pip'] = self.calculate_joint_angle(lm[13], lm[14], lm[15])
        angles['ring_dip'] = self.calculate_joint_angle(lm[14], lm[15], lm[16])
        
        # Pinky finger angles
        angles['pinky_mcp'] = self.calculate_joint_angle(lm[0], lm[17], lm[18])
        angles['pinky_pip'] = self.calculate_joint_angle(lm[17], lm[18], lm[19])
        angles['pinky_dip'] = self.calculate_joint_angle(lm[18], lm[19], lm[20])
        
        # Wrist angle (for overall hand orientation)
        angles['wrist_angle'] = self.calculate_joint_angle(lm[0], lm[1], lm[5])
        
        return angles
    
    def compute_derivatives(
        self, 
        angles: Dict[str, float], 
        timestamp: float
    ) -> Tuple[Dict[str, float], Dict[str, float]]:
        """
        Compute first and second derivatives (velocity and acceleration) of angles.
        Uses temporal smoothing and finite differences.
        
        Returns:
            (angular_velocities, angular_accelerations)
        """
        velocities = {}
        accelerations = {}
        
        # Update history
        self.timestamp_history.append(timestamp)
        
        for key in self.angle_keys:
            angle_value = angles.get(key, 0.0)
            self.angle_history[key].append(angle_value)
            
            # Compute velocity (first derivative)
            velocity = 0.0
            if len(self.angle_history[key]) >= 2 and len(self.timestamp_history) >= 2:
                angle_values = list(self.angle_history[key])
                timestamps = list(self.timestamp_history)
                
                # Use central difference for better accuracy
                if len(angle_values) >= 3:
                    # Central difference: (f[i+1] - f[i-1]) / (2*dt)
                    dt = timestamps[-1] - timestamps[-3]
                    if dt > 1e-6:
                        velocity = (angle_values[-1] - angle_values[-3]) / dt
                else:
                    # Forward difference
                    dt = timestamps[-1] - timestamps[-2]
                    if dt > 1e-6:
                        velocity = (angle_values[-1] - angle_values[-2]) / dt
            
            velocities[key] = velocity
            self.velocity_history[key].append(velocity)
            
            # Compute acceleration (second derivative)
            acceleration = 0.0
            if len(self.velocity_history[key]) >= 2 and len(self.timestamp_history) >= 2:
                velocity_values = list(self.velocity_history[key])
                timestamps = list(self.timestamp_history)
                
                # Central difference for acceleration
                if len(velocity_values) >= 3:
                    dt = timestamps[-1] - timestamps[-3]
                    if dt > 1e-6:
                        acceleration = (velocity_values[-1] - velocity_values[-3]) / dt
                else:
                    # Forward difference
                    dt = timestamps[-1] - timestamps[-2]
                    if dt > 1e-6:
                        acceleration = (velocity_values[-1] - velocity_values[-2]) / dt
            
            accelerations[key] = acceleration
        
        return velocities, accelerations
    
    def normalize_angles(
        self, 
        angles: Dict[str, float], 
        baseline_angles: Optional[Dict[str, float]]
    ) -> Dict[str, float]:
        """
        Normalize angles relative to baseline.
        Subtracts baseline angle from current angle.
        """
        if baseline_angles is None:
            return angles
        
        normalized = {}
        for key in self.angle_keys:
            baseline = baseline_angles.get(key, 0.0)
            normalized[key] = angles.get(key, 0.0) - baseline
        
        return normalized
    
    def reset(self):
        """Reset all history buffers."""
        for key in self.angle_keys:
            self.angle_history[key].clear()
            self.velocity_history[key].clear()
        self.timestamp_history.clear()

