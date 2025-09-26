// server.js

// 1. Import required libraries
const express = require("express");
const twilio = require("twilio");
const dotenv = require("dotenv");
const cors = require("cors");

// 2. Load environment variables from .env file
dotenv.config();

// 3. Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// 4. Get Twilio credentials from environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

// Check if all required credentials are present
if (!accountSid || !authToken || !twilioPhoneNumber) {
  console.error("Error: Missing Twilio credentials in .env file.");
  process.exit(1);
}

const client = new twilio(accountSid, authToken);

// 5. Middleware Setup
app.use(cors());
app.use(express.json());

// 6. Define the API endpoint for booking a ride
app.post("/api/book-ride", (req, res) => {
  console.log("Received booking request:", req.body);

  // Get all data from the frontend's request
  const { name, phone, paymentMethod, pickup, duration } = req.body;

  // Basic validation
  if (!name || !phone || !pickup || !duration) {
    return res.status(400).json({ error: "All fields are required." });
  }

  // --- MODIFIED SECTION: Professional Message Templates ---

  let messageBody = "";
  const upiId = process.env.YOUR_UPI_ID || "your-upi-id@okhdfcbank";

  if (paymentMethod === "Online") {
    // Create a clickable UPI link
    const upiLink = `upi://pay?pa=${upiId}&pn=TrustnDrive&cu=INR`;

    messageBody = `
Dear ${name},

Your TrustnDrive booking has been confirmed. Please review the details below.

Booking Summary:
- Pickup Location: ${pickup}
- Duration: ${duration}hrs

To finalize your ride, please complete the payment using the link below or by entering the UPI ID in your payment app.
UPI Link: ${upiLink}
UPI ID: ${upiId}

A driver will be assigned to you shortly. Thank you for choosing TrustnDrive.
    `;
  } else {
    // For 'Cash' payment
    messageBody = `
Dear ${name},

Your TrustnDrive booking has been confirmed. Please review the details below.

Booking Summary:
- Pickup Location: ${pickup}
- Duration: ${duration}hrs

Payment Method: Pay with Cash
Please have the payment ready for your driver upon trip completion.

A driver is being assigned and will arrive at your location shortly. Thank you for choosing TrustnDrive.
    `;
  }

  // --- End of modified section ---

  // 7. Use the Twilio client to send the WhatsApp message
  client.messages
    .create({
      from: `whatsapp:${twilioPhoneNumber}`,
      to: `whatsapp:${phone}`,
      body: messageBody.trim(), // .trim() removes any extra whitespace
    })
    .then((message) => {
      console.log("WhatsApp message sent successfully! SID:", message.sid);
      res.status(200).json({
        success: true,
        message: "Booking confirmed! Check your WhatsApp.",
      });
    })
    .catch((error) => {
      console.error("Error sending WhatsApp message:", error);
      res.status(500).json({
        success: false,
        error: "Failed to send confirmation message.",
      });
    });
});

// 8. Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
