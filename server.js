// server.js

// 1. Import required libraries
const express = require("express");
const twilio = require("twilio");
const dotenv = require("dotenv");
const cors = require("cors");
const { twiml } = require("twilio"); // Twilio helper library

// 2. Load environment variables
dotenv.config();

// 3. Initialize Express app and Twilio client
const app = express();
const PORT = process.env.PORT || 3001;
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
const client = new twilio(accountSid, authToken);

// --- IN-MEMORY STORAGE FOR THE ACTIVE RIDE ---
// This is a simple placeholder for a database.
// WARNING: This can only handle ONE active ride at a time.
let activeRide = null;

// 4. Middleware Setup
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "https://safarsaathii.netlify.app", // IMPORTANT: Replace with your live Netlify/Vercel URL
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Middleware for Twilio webhooks

// 5. Endpoint for creating a booking
app.post("/api/book-ride", async (req, res) => {
  try {
    const { name, phone, paymentMethod, pickup, duration, coordinates } =
      req.body;
    if (!name || !phone || !pickup || !duration) {
      return res
        .status(400)
        .json({ error: "All booking fields are required." });
    }

    // --- Message for the Customer (Full content) ---
    let customerMessageBody = "";
    const upiId = process.env.YOUR_UPI_ID || "your-upi-id@okhdfcbank";

    if (paymentMethod === "Online") {
      const upiLink = `upi://pay?pa=${upiId}&pn=SafarSaathi&cu=INR`;
      customerMessageBody = `
Dear ${name},

Your SafarSaathi booking has been confirmed. Please review the details below.

Booking Summary:
- Pickup Location: ${pickup}
- Duration: ${duration == 1 ? duration + "hr" : duration + "hrs"}

To finalize your ride, please complete the payment using the link below or by entering the UPI ID in your payment app.
UPI Link: ${upiLink}
UPI ID: ${upiId}

A driver will be assigned to you shortly. Thank you for choosing SafarSaathi.
      `;
    } else {
      customerMessageBody = `
Dear ${name},

Your SafarSaathi booking has been confirmed. Please review the details below.

Booking Summary:
- Pickup Location: ${pickup}
- Duration: ${duration == 1 ? duration + "hr" : duration + "hrs"}

Payment Method: Pay with Cash
Please have the payment ready for your driver upon trip completion.

A driver is being assigned and will arrive at your location shortly. Thank you for choosing SafarSaathi.
      `;
    }

    const customerMessagePromise = client.messages.create({
      from: `whatsapp:${twilioPhoneNumber}`,
      to: `whatsapp:${phone}`,
      body: customerMessageBody.trim(),
    });

    // --- Message for the Driver ---
    let driverMessageBody = `New Ride Alert! 🚕\n\nCustomer Details:\n- Name: ${name}\n- Contact: ${
      "+" + phone
    }\n- Pickup: ${pickup}\n- Duration: ${duration} hour(s)`;
    if (coordinates && coordinates.lat && coordinates.lon) {
      driverMessageBody += `\n- Location Pin: https://www.google.com/maps?q=${coordinates.lat},${coordinates.lon}`;
    }

    const driverNumber = `whatsapp:${process.env.MAIN_DRIVER_WHATSAPP_NUMBER}`;
    const driverMessagePromise = client.messages.create({
      from: `whatsapp:${twilioPhoneNumber}`,
      to: driverNumber,
      body: driverMessageBody.trim(),
    });

    // --- STORE THE RIDE IN-MEMORY ---
    activeRide = {
      customer_phone: `whatsapp:${phone}`,
      driver_phone: driverNumber,
    };
    console.log("Stored active ride:", activeRide);

    await Promise.all([customerMessagePromise, driverMessagePromise]);
    res.status(200).json({
      success: true,
      message: "Booking confirmed! Check your WhatsApp.",
    });
  } catch (error) {
    console.error("Error in /api/book-ride:", error);
    res
      .status(500)
      .json({ success: false, error: "Failed to process booking." });
  }
});

// --- 6. NEW ENDPOINT FOR INCOMING MESSAGES ---
app.post("/api/incoming-message", async (req, res) => {
  const incomingMsg = req.body;
  const driverNumber = incomingMsg.From;
  const driverReply = incomingMsg.Body;

  console.log(`Received reply from ${driverNumber}: "${driverReply}"`);

  try {
    let customerNumber = null;

    // Check if there is an active ride and if the message is from the assigned driver
    if (activeRide && activeRide.driver_phone === driverNumber) {
      customerNumber = activeRide.customer_phone;
      console.log(`Found matching customer for driver: ${customerNumber}`);
    }

    if (customerNumber) {
      // Forward the driver's message to the customer
      await client.messages.create({
        from: `whatsapp:${twilioPhoneNumber}`,
        to: customerNumber,
        body: `${"Message from your driver : " + driverReply}`,
      });
      console.log(`Message forwarded to ${customerNumber}`);
    } else {
      console.log(
        `Could not find an active ride for driver ${driverNumber}. Ignoring message.`,
      );
    }
  } catch (error) {
    console.error("Error processing incoming message:", error);
  }

  // Send an empty TwiML response to let Twilio know we've handled the message.
  const response = new twiml.MessagingResponse();
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(response.toString());
});

// 7. Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
