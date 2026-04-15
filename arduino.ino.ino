// =======================================
// HYBRID QUANTUM TELEPORTATION SYSTEM
// ARDUINO LED VISUALIZATION (FINAL)
// =======================================

// LED Pins
const int LED1 = 8;   // Bit 0
const int LED2 = 9;   // Bit 1
const int LED3 = 10;  // Bit 2

String inputString = "";
bool dataReady = false;

void setup() {
  Serial.begin(9600);

  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  pinMode(LED3, OUTPUT);

  // Turn OFF all LEDs initially
  digitalWrite(LED1, LOW);
  digitalWrite(LED2, LOW);
  digitalWrite(LED3, LOW);

  Serial.println("Arduino Ready ✅");
}

void loop() {

  // If full data received
  if (dataReady) {

    // Ensure correct length (3 bits)
    if (inputString.length() >= 3) {

      int bit0 = inputString.charAt(0) - '0';
      int bit1 = inputString.charAt(1) - '0';
      int bit2 = inputString.charAt(2) - '0';

      // Debug print (optional)
      Serial.print("Received: ");
      Serial.println(inputString);

      // Control LEDs
      digitalWrite(LED1, bit0 ? HIGH : LOW);
      digitalWrite(LED2, bit1 ? HIGH : LOW);
      digitalWrite(LED3, bit2 ? HIGH : LOW);
    }

    // Reset for next input
    inputString = "";
    dataReady = false;
  }
}

// This function runs automatically when data arrives
void serialEvent() {
  while (Serial.available()) {
    char incomingChar = (char)Serial.read();

    if (incomingChar == '\n') {
      dataReady = true;
    } else {
      inputString += incomingChar;
    }
  }
}