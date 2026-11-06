/**
 * ============================================================================
 * Assistive Obstacle Detection & Haptic Warning System
 * Microcontroller: Arduino Uno
 * Circuit Wiring (matches uploaded diagram):
 *  - HC-SR04 Ultrasonic Sensor:
 *      * VCC  -> Arduino 5V
 *      * GND  -> Arduino GND
 *      * TRIG -> Digital Pin 10
 *      * ECHO -> Digital Pin 9
 *  - 16x2 LCD Display (I2C Module):
 *      * GND  -> Arduino GND
 *      * VCC  -> Arduino 5V
 *      * SDA  -> Analog Pin A4
 *      * SCL  -> Analog Pin A5
 *  - Piezo Buzzer:
 *      * Positive (+) -> Digital Pin 8
 *      * Negative (-) -> Arduino GND
 *  - Vibration Motor / Actuator (with resistor):
 *      * Positive (+) -> Digital Pin 6 (PWM)
 *      * Negative (-) -> Arduino GND
 * ============================================================================
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>

// Pin Definitions matching circuit diagram
const int PIN_TRIG   = 10;
const int PIN_ECHO   = 9;
const int PIN_BUZZER = 8;
const int PIN_MOTOR  = 6;

// I2C LCD Configuration (default address 0x27 or 0x3F, 16 cols x 2 rows)
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Thresholds in centimeters
const int DIST_CRITICAL = 15;  // <= 15cm: High alarm + Strong vibration
const int DIST_WARNING  = 35;  // 16cm - 35cm: Beep warning + Gentle pulse
const int DIST_SAFE     = 60;  // > 35cm: Safe

void setup() {
  Serial.begin(9600); // For serial communication / Web Serial to Signa web app

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_MOTOR, OUTPUT);

  // Initialize I2C LCD
  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Signa Assist AI");
  lcd.setCursor(0, 1);
  lcd.print("Sensor Active...");
  delay(1200);
  lcd.clear();
}

long readDistanceCm() {
  // Clear trigger pin
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);

  // Send 10 microsecond pulse
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  // Measure echo duration
  long duration = pulseIn(PIN_ECHO, HIGH, 30000); // 30ms timeout
  if (duration == 0) return 999; // Out of range

  // Speed of sound = 343 m/s -> 0.0343 cm/microsecond
  long distanceCm = (duration * 0.0343) / 2;
  return distanceCm;
}

void loop() {
  long distance = readDistanceCm();

  // Print to Serial (can be read by browser via Web Serial API)
  Serial.print("DIST:");
  Serial.println(distance);

  // Update LCD Display
  lcd.setCursor(0, 0);
  lcd.print("Dist: ");
  if (distance < 999) {
    lcd.print(distance);
    lcd.print(" cm    ");
  } else {
    lcd.print("> 100 cm   ");
  }

  lcd.setCursor(0, 1);
  if (distance <= DIST_CRITICAL) {
    // Critical Danger Zone
    lcd.print("ALERT: TOO CLOSE");
    digitalWrite(PIN_BUZZER, HIGH);
    analogWrite(PIN_MOTOR, 255); // Maximum vibration
  } else if (distance <= DIST_WARNING) {
    // Warning Proximity Zone
    lcd.print("Status: Caution ");
    // Pulsed beep & vibration
    digitalWrite(PIN_BUZZER, HIGH);
    analogWrite(PIN_MOTOR, 160);
    delay(80);
    digitalWrite(PIN_BUZZER, LOW);
    analogWrite(PIN_MOTOR, 0);
  } else {
    // Safe Zone
    lcd.print("Status: Path OK ");
    digitalWrite(PIN_BUZZER, LOW);
    analogWrite(PIN_MOTOR, 0);
  }

  delay(100);
}
