"""
Movement Protocol Definition for Brunnstrom Stage Assessment
Defines the standardized sequence of movements that all subjects must perform.
"""

from dataclasses import dataclass
from typing import List, Optional
from enum import Enum


class MovementType(Enum):
    """Clinically relevant movement types for Brunnstrom assessment."""
    BASELINE_REST = "baseline_rest"  # Reserved for optional baseline trials (not used in main protocol)
    FIST_CLOSE = "fist_close"
    FIST_OPEN = "fist_open"
    HAND_WAVE_LR = "hand_wave_lr"
    PALM_UP_DOWN = "palm_up_down"
    FIST_ROTATION_FAST = "fist_rotation_fast"
    FINGER_SEQUENCE_PREP = "finger_sequence_prep"
    FINGER_SEQ_THUMB = "finger_seq_thumb"
    FINGER_SEQ_INDEX = "finger_seq_index"
    FINGER_SEQ_MIDDLE = "finger_seq_middle"
    FINGER_SEQ_RING = "finger_seq_ring"
    FINGER_SEQ_PINKY = "finger_seq_pinky"


@dataclass
class MovementProtocol:
    """Defines a single movement in the protocol."""
    movement_type: MovementType
    name: str
    instruction: str
    duration_seconds: float
    sub_instruction: Optional[str] = None  # For sub-steps within a composite instruction
    hold_duration_seconds: float = 0.0  # Time to hold at end position
    rest_after_seconds: float = 2.0  # Rest period after movement
    target_finger: Optional[str] = None  # For isolation tasks
    description: str = ""


class ClinicalProtocol:
    """Standardized movement protocol for Brunnstrom stage assessment."""
    
    def __init__(self):
        """Initialize the clinical movement protocol."""
        self.movements: List[MovementProtocol] = self._define_protocol()
    
    def _define_protocol(self) -> List[MovementProtocol]:
        """
        Define the standardized movement protocol.
        All subjects follow this exact sequence. This protocol is aligned with
        the textual specification in the project brief:

        1. Close your fist
        2. Open your fist
        3. Wave hand sideways (right and left)
        4. Move palm up and down (wrist movement)
        5. Close fist and rotate at maximum speed
        6. Close fist and open fingers one by one (thumb, index, middle, ring, little)
        """
        return [
            # Basic hand movements
            MovementProtocol(
                movement_type=MovementType.FIST_CLOSE,
                name="Close Fist",
                instruction="Close your fist slowly and hold the position.",
                duration_seconds=3.0,
                hold_duration_seconds=3.0,
                rest_after_seconds=3.0,
                description="Full hand closure to assess gross flexion synergy"
            ),
            
            MovementProtocol(
                movement_type=MovementType.FIST_OPEN,
                name="Open Hand",
                instruction="Open your fist fully and spread your fingers.",
                duration_seconds=3.0,
                hold_duration_seconds=3.0,
                rest_after_seconds=3.0,
                description="Full hand extension to assess extension synergy"
            ),
            
            # Wave hand sideways (right and left)
            MovementProtocol(
                movement_type=MovementType.HAND_WAVE_LR,
                name="Wave Hand Sideways",
                instruction="Wave your hand slowly from left to right and then right to left.",
                duration_seconds=8.0,
                hold_duration_seconds=0.0,
                rest_after_seconds=3.0,
                description="Lateral hand motion and coordination across both directions"
            ),
            
            # Wrist movement: palm up and down
            MovementProtocol(
                movement_type=MovementType.PALM_UP_DOWN,
                name="Palm Up and Down",
                instruction="Move your palm up and down using only your wrist.",
                duration_seconds=8.0,
                hold_duration_seconds=0.0,
                rest_after_seconds=3.0,
                description="Wrist angle changes and stability with minimal finger motion"
            ),
            
            # Close fist and rotate at maximum speed
            MovementProtocol(
                movement_type=MovementType.FIST_ROTATION_FAST,
                name="Fast Fist Rotation",
                instruction="Close your fist and rotate it as fast as you comfortably can.",
                duration_seconds=6.0,
                hold_duration_seconds=0.0,
                rest_after_seconds=4.0,
                description="Rotational speed, coordination, and dynamic control"
            ),
            
            # Close fist before finger-by-finger opening sequence
            MovementProtocol(
                movement_type=MovementType.FINGER_SEQUENCE_PREP,
                name="Finger Sequence Preparation",
                instruction="Close your fist.",
                duration_seconds=2.0,
                hold_duration_seconds=2.0,
                rest_after_seconds=1.5,
                description="Preparation for sequential finger opening"
            ),
            
            # Sequential finger opening: each is a sub-instruction within the same
            # composite instruction block "Close fist and open fingers one by one".
            MovementProtocol(
                movement_type=MovementType.FINGER_SEQ_THUMB,
                name="Finger Sequence",
                instruction="Open your thumb.",
                sub_instruction="Open your thumb.",
                duration_seconds=3.0,
                hold_duration_seconds=2.0,
                rest_after_seconds=1.5,
                target_finger="thumb",
                description="Finger isolation and synergy during thumb opening"
            ),
            
            MovementProtocol(
                movement_type=MovementType.FINGER_SEQ_INDEX,
                name="Finger Sequence",
                instruction="Open your index finger.",
                sub_instruction="Open your index finger.",
                duration_seconds=3.0,
                hold_duration_seconds=2.0,
                rest_after_seconds=1.5,
                target_finger="index",
                description="Finger isolation and synergy during index finger opening"
            ),
            
            MovementProtocol(
                movement_type=MovementType.FINGER_SEQ_MIDDLE,
                name="Finger Sequence",
                instruction="Open your middle finger.",
                sub_instruction="Open your middle finger.",
                duration_seconds=3.0,
                hold_duration_seconds=2.0,
                rest_after_seconds=1.5,
                target_finger="middle",
                description="Finger isolation and synergy during middle finger opening"
            ),
            
            MovementProtocol(
                movement_type=MovementType.FINGER_SEQ_RING,
                name="Finger Sequence",
                instruction="Open your ring finger.",
                sub_instruction="Open your ring finger.",
                duration_seconds=3.0,
                hold_duration_seconds=2.0,
                rest_after_seconds=1.5,
                target_finger="ring",
                description="Finger isolation and synergy during ring finger opening"
            ),
            
            MovementProtocol(
                movement_type=MovementType.FINGER_SEQ_PINKY,
                name="Finger Sequence",
                instruction="Open your little finger.",
                sub_instruction="Open your little finger.",
                duration_seconds=3.0,
                hold_duration_seconds=2.0,
                rest_after_seconds=3.0,
                target_finger="pinky",
                description="Finger isolation and synergy during little finger opening"
            ),
        ]
    
    def get_movement_by_index(self, index: int) -> Optional[MovementProtocol]:
        """Get movement protocol by index."""
        if 0 <= index < len(self.movements):
            return self.movements[index]
        return None
    
    def get_total_duration(self) -> float:
        """Calculate total protocol duration in seconds."""
        total = 0.0
        for movement in self.movements:
            total += movement.duration_seconds
            total += movement.hold_duration_seconds
            total += movement.rest_after_seconds
        return total
    
    def get_movement_count(self) -> int:
        """Get total number of movements in protocol."""
        return len(self.movements)

