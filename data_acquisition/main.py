"""
Protocol-Driven Hand Movement Data Acquisition System
For Brunnstrom Stage Assessment

This system enforces a structured, protocol-driven data collection flow where
hand movement recording follows a predefined movement protocol. Each session
guides the subject through a fixed set of clinically relevant movements with
clearly defined start times, durations, and end times.
"""

import cv2
import mediapipe as mp
import numpy as np
import time
from datetime import datetime
from typing import Optional, Tuple
import os

from session import DataAcquisitionSession, SessionState
from protocol import MovementType


class HandDetector:
    """Handles MediaPipe hand detection and visualization."""
    
    def __init__(self):
        """Initialize MediaPipe hands."""
        self.mp_hands = mp.solutions.hands
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        # Initialize MediaPipe Hands with configuration
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=1,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.5
        )
    
    def process_frame(self, frame: np.ndarray) -> Tuple[Optional[list], float]:
        """
        Process a frame and extract hand landmarks.
        
        Returns:
            (landmarks, confidence) where landmarks is None if no hand detected
        """
        # Convert BGR to RGB
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Process the frame
        results = self.hands.process(rgb_frame)
        
        landmarks = None
        confidence = 0.0
        
        if results.multi_hand_landmarks:
            # Get the first (and only) hand
            hand_landmarks = results.multi_hand_landmarks[0]
            landmarks = hand_landmarks.landmark
            
            # Get confidence (average of detection and tracking confidence)
            # MediaPipe doesn't expose these directly, so we estimate from presence
            confidence = 0.8  # Default confidence when hand is detected
            
            # Draw hand skeleton
            self.mp_drawing.draw_landmarks(
                frame,
                hand_landmarks,
                self.mp_hands.HAND_CONNECTIONS,
                self.mp_drawing_styles.get_default_hand_landmarks_style(),
                self.mp_drawing_styles.get_default_hand_connections_style()
            )
        else:
            confidence = 0.0
        
        return landmarks, confidence
    
    def close(self):
        """Close MediaPipe hands."""
        self.hands.close()


class ProtocolDisplay:
    """Manages on-screen display of protocol information."""
    
    def __init__(self):
        """Initialize display."""
        self.current_instruction = ""
        self.current_state = SessionState.INITIALIZING
    
    def update_instruction(self, instruction: str):
        """Update current instruction text."""
        self.current_instruction = instruction
    
    def update_state(self, state: SessionState):
        """Update current state."""
        self.current_state = state
    
    def draw_on_frame(self, frame: np.ndarray, session: DataAcquisitionSession):
        """Draw protocol information on frame."""
        h, w = frame.shape[:2]
        
        # Semi-transparent overlay for text
        overlay = frame.copy()
        
        # Get current movement
        movement = session.get_current_movement()
        progress = session.get_progress()
        
        # State and instruction display (top left)
        y_offset = 30
        line_height = 30
        
        # Session info
        cv2.putText(frame, f"Session: {session.session_id}", (10, y_offset),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        y_offset += line_height
        
        cv2.putText(frame, f"Progress: {progress['current_movement']}/{progress['total_movements']} "
                   f"({progress['progress_percent']:.1f}%)", (10, y_offset),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        y_offset += line_height
        
        # State
        state_colors = {
            SessionState.CALIBRATING: (255, 255, 0),
            SessionState.INSTRUCTION: (255, 165, 0),
            SessionState.COUNTDOWN: (255, 200, 0),
            SessionState.RECORDING: (0, 255, 0),
            SessionState.HOLDING: (0, 200, 255),
            SessionState.RESTING: (128, 128, 128),
            SessionState.COMPLETED: (0, 255, 255)
        }
        state_color = state_colors.get(self.current_state, (255, 255, 255))
        cv2.putText(frame, f"State: {self.current_state.value.upper()}", (10, y_offset),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, state_color, 2)
        y_offset += line_height + 10
        
        # Current movement
        if movement:
            cv2.putText(frame, f"Movement: {movement.name}", (10, y_offset),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            y_offset += line_height
        
        # Instruction (prominent display)
        if self.current_instruction:
            # Split long instructions into multiple lines
            words = self.current_instruction.split()
            lines = []
            current_line = ""
            for word in words:
                if len(current_line + " " + word) < 50:
                    current_line += " " + word if current_line else word
                else:
                    if current_line:
                        lines.append(current_line)
                    current_line = word
            if current_line:
                lines.append(current_line)
            
            # Display instruction in center
            instruction_y = h // 2 - (len(lines) * 35) // 2
            for i, line in enumerate(lines):
                text_size = cv2.getTextSize(line, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)[0]
                text_x = (w - text_size[0]) // 2
                # Highlight countdown messages
                if "Get ready" in line or "Starting now" in line:
                    color = (0, 255, 0)  # Green for countdown
                    thickness = 3
                else:
                    color = (0, 255, 255)  # Cyan for instructions
                    thickness = 2
                cv2.putText(frame, line, (text_x, instruction_y + i * 35),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, thickness)
        
        # Trial info (if recording)
        if session.current_trial:
            trial = session.current_trial
            trial_y = h - 100
            cv2.putText(frame, f"Trial: {trial.metadata.movement_name} "
                       f"(#{trial.metadata.trial_number})", (10, trial_y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
            trial_y += 25
            cv2.putText(frame, f"Frames: {trial.get_frame_count()}, "
                       f"Duration: {trial.get_duration():.1f}s", (10, trial_y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
        
        # Status messages (bottom)
        status_y = h - 20
        if self.current_state == SessionState.COMPLETED:
            cv2.putText(frame, "Session Complete! Press 'q' to save and exit.", (10, status_y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        elif self.current_state == SessionState.ERROR:
            cv2.putText(frame, "ERROR: Check console for details. Press 'q' to exit.", (10, status_y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
        else:
            cv2.putText(frame, "Press 'q' to quit (data will be saved)", (10, status_y),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (128, 128, 128), 1)


def main():
    """Main application loop with protocol-driven data acquisition."""
    print("=" * 70)
    print("Protocol-Driven Hand Movement Data Acquisition System")
    print("For Brunnstrom Stage Assessment")
    print("=" * 70)
    
    # Automatic session configuration (no user input)
    timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    patient_id = "default_patient"
    session_id = f"session_{timestamp_str}"
    affected_hand = "right"
    
    print(f"\nSession: {session_id}")
    print(f"Patient: {patient_id}")
    print(f"Affected Hand: {affected_hand}")
    print("\nInitializing camera...")
    
    # Initialize camera
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: Could not open camera!")
        return
    
    # Set camera properties
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    cap.set(cv2.CAP_PROP_FPS, 30)
    
    # Initialize components
    detector = HandDetector()
    display = ProtocolDisplay()
    
    # Initialize session
    session = DataAcquisitionSession(
        patient_id=patient_id,
        session_id=session_id,
        affected_hand=affected_hand
    )
    
    # Set callbacks
    def instruction_callback(instruction: str):
        display.update_instruction(instruction)
    
    def state_change_callback(state: SessionState):
        display.update_state(state)
        if state == SessionState.COMPLETED:
            # Set final thank-you message when protocol is fully completed
            display.update_instruction("Thank you for following the instructions. Data recording is complete.")
            print("\n" + "=" * 70)
            print("Session completed successfully!")
            print(f"Total trials: {len([t for t in session.trials if t.is_valid])}")
            print("=" * 70)
    
    session.set_instruction_callback(instruction_callback)
    session.set_state_change_callback(state_change_callback)
    
    # ---- Pre-session: Hand placement / initialization (no data recording) ----
    print("\n" + "=" * 70)
    print("Initialization: Please place your hand clearly in front of the camera and hold it steady.")
    print("No data is recorded during this step. Waiting for stable hand detection...")
    print("=" * 70)

    stable_start: Optional[float] = None
    required_stable_seconds = 2.0

    while True:
        ret, frame = cap.read()
        if not ret:
            print("Error: Could not read frame during initialization!")
            cap.release()
            cv2.destroyAllWindows()
            detector.close()
            return

        frame = cv2.flip(frame, 1)

        landmarks, confidence = detector.process_frame(frame)

        # Check for sufficiently confident hand detection
        if landmarks is not None and confidence >= 0.7:
            if stable_start is None:
                stable_start = time.time()
            elapsed = time.time() - stable_start
            # Display message while waiting for stability
            cv2.putText(
                frame,
                "Hand detected. Hold steady...",
                (30, 50),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.8,
                (0, 255, 0),
                2,
            )
            if elapsed >= required_stable_seconds:
                cv2.putText(
                    frame,
                    "Initialization complete. Starting protocol...",
                    (30, 90),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (0, 255, 255),
                    2,
                )
                cv2.imshow('Protocol-Driven Hand Movement Tracker', frame)
                cv2.waitKey(1000)
                break
        else:
            stable_start = None
            cv2.putText(
                frame,
                "Please place your hand clearly in front of the camera and hold it steady.",
                (30, 50),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (0, 255, 255),
                2,
            )

        cv2.imshow('Protocol-Driven Hand Movement Tracker', frame)
        if cv2.waitKey(1) & 0xFF == ord('q'):
            print("\nInitialization aborted by user.")
            cap.release()
            cv2.destroyAllWindows()
            detector.close()
            return

    # ---- Start protocol-driven session (recording only during active instructions) ----
    session.start_session()
    
    print("\nCamera initialized. Protocol-driven recording active.")
    print("Follow on-screen instructions for each movement.\n")
    
    frame_count = 0
    last_state = None
    
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                print("Error: Could not read frame!")
                break
            
            # Flip frame horizontally for mirror effect
            frame = cv2.flip(frame, 1)
            
            # Get current timestamp
            timestamp = time.time() - session.session_start_time
            
            # Detect hand
            landmarks, confidence = detector.process_frame(frame)
            
            # Process frame through session (handles all states including countdown)
            should_continue = session.process_frame(landmarks, confidence, timestamp)
            
            if not should_continue:
                # Session complete or error
                if session.state == SessionState.COMPLETED:
                    # Draw final thank-you message once before exiting
                    display.draw_on_frame(frame, session)
                    cv2.imshow('Protocol-Driven Hand Movement Tracker', frame)
                    cv2.waitKey(1500)
                    break
                elif session.state == SessionState.ERROR:
                    print("Session error occurred!")
                    break
            
            # Handle state transitions
            if session.state != last_state:
                if session.state == SessionState.READY:
                    # Auto-start next movement
                    if session.current_movement_index < len(session.protocol.movements):
                        session.start_next_movement(timestamp)
                last_state = session.state
            
            # Update display
            display.draw_on_frame(frame, session)
            
            # Show frame
            cv2.imshow('Protocol-Driven Hand Movement Tracker', frame)
            
            # Handle key presses
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                print("\nQuitting and saving data...")
                break
            elif key == ord('n') and session.state in [SessionState.READY, SessionState.INSTRUCTION]:
                # Manual next movement (for testing)
                if session.current_movement_index < len(session.protocol.movements):
                    session.start_next_movement(timestamp)
            
            frame_count += 1
    
    except KeyboardInterrupt:
        print("\nInterrupted by user. Saving data...")
    
    finally:
        # Cleanup
        cap.release()
        cv2.destroyAllWindows()
        detector.close()
        
        # Save session data (one atomic file per session)
        if session.session_rows:
            session.save_session()
            print("\nSession data saved successfully!")
            print(f"Output directory: {session.output_dir}")
        else:
            print("\nNo session data was recorded.")


if __name__ == "__main__":
    main()
