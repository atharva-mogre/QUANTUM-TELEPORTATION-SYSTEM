# ==========================================
# HYBRID QUANTUM TELEPORTATION SYSTEM
# FINAL VERSION (QISKIT + ARDUINO)
# ==========================================

from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator
import serial
import time

# ------------------------------
# SERIAL SETUP (CHANGE COM PORT)
# ------------------------------
try:
    ser = serial.Serial('COM14', 9600, timeout=1)  # Change COM port if needed
    time.sleep(2)  # Allow Arduino to reset
    print("✅ Serial connection established")
except:
    print("❌ Error: Could not open serial port")
    ser = None

# ------------------------------
# CREATE QUANTUM CIRCUIT
# ------------------------------
qc = QuantumCircuit(3, 3)

# Step 1: Prepare input state (superposition)
qc.h(0)

# Step 2: Create entangled pair (q1 & q2)
qc.h(1)
qc.cx(1, 2)

# Step 3: Teleportation operations (Alice)
qc.cx(0, 1)
qc.h(0)

# Step 4: Measure Alice’s qubits
qc.measure([0, 1], [0, 1])

# Step 5: Apply correction (approximation for simulator)
qc.cx(1, 2)
qc.cz(0, 2)

# Step 6: Measure output qubit (Bob)
qc.measure(2, 2)

# ------------------------------
# RUN SIMULATION
# ------------------------------
simulator = AerSimulator()

print("\n🚀 Running quantum teleportation...\n")

job = simulator.run(qc, shots=10, memory=True)
result = job.result()

# Get individual shot results (BEST for Arduino)
memory = result.get_memory()

print("Quantum Outputs (per shot):")
print(memory)

# ------------------------------
# SEND DATA TO ARDUINO
# ------------------------------
if ser:
    print("\n📡 Sending data to Arduino...\n")

    for outcome in memory:
        print("➡ Sending:", outcome)

        ser.write(outcome.encode())   # Send binary string
        ser.write(b'\n')              # End of data

        time.sleep(1)  # Give Arduino time to process

    ser.close()
    print("\n✅ Transmission complete")

else:
    print("\n⚠ Skipping serial transmission (Arduino not connected)")