//Backend server.js
import path from 'path';
import 'dotenv/config';
import express from 'express';
import OpenAI from 'openai';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import session from 'express-session';
import validator from 'validator';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

// Mongoose Models
import User from './models/User.js';
import Doctor from './models/Doctor.js';
import Appointment from './models/Appointment.js';

const app = express();
const port = process.env.PORT;

const __dirname = path.resolve();

// Rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Apply rate limiting to all routes
app.use(limiter);

// CORS configuration
const allowedOrigins = [
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  process.env.FRONTEND_URL // Add your production frontend URL here
].filter(Boolean); // Remove any undefined values

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('Blocked CORS origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(helmet());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 1 day
  }
}));

// Add this after your session middleware
app.use((req, res, next) => {
  next();
});

// OpenAI Configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Existing GPT Prediction Endpoint
app.post('/predict', async (req, res) => {
  const symptomsText = req.body.symptoms;

  if (!symptomsText || symptomsText.trim() === '') {
    return res.status(400).json({ error: 'Please enter some symptoms.' });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: `Given the symptoms: "${symptomsText}", what is the most likely disease? 
          Provide a short explanation. And give remedies if applicable.
          Return the result in the following format:
          Possible Diseases: ...
          Explanation: ...
          Precautions: ...
          Remedies: ...`,
        },
      ],
    });

    const prediction = completion.choices[0].message.content;
    res.json({ prediction });
  } catch (error) {
    console.error('Error during OpenAI API call:', error);
    res.status(500).json({ error: 'Error during prediction.', details: error.message });
  }
});

// User Registration Endpoint
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }
    if (!validator.isStrongPassword(password,
      {
        minLength: 6,
        minLowercase: 0,
        minUppercase: 0,
        minNumbers: 0,
        minSymbols: 0
      })) {
      return res.status(400).json({ error: 'Password must be at least 6 characters and strong.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    req.session.userId = newUser._id;
    req.session.save();
    res.status(201).json({ message: 'User registered successfully', userId: newUser._id });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// User Login Endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required.' });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    const user = await User.findOne({ email });

    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    req.session.userId = user._id;
    req.session.save();
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({
      message: 'Login successful',
      userId: user._id,
      email: user.email,
      username: user.name,
      token: token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

//Get all doctors Endpoint
app.get('/api/doctors', async (req, res) => {
  try {
    const doctors = await Doctor.find({});
    if (!doctors || doctors.length === 0) {
      // If no doctors in database, return the static data
      return res.json(doctorData);
    }
    res.json(doctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    // If there's an error, return the static data
    res.json(doctorData);
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'defaultsecret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Get appointments for a user
app.get('/api/appointments/:username', authenticateToken, async (req, res) => {
  try {
    const { username } = req.params;
    const tokenUser = req.user;

    // Get the user from the token
    const user = await User.findById(tokenUser.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if the requesting user is the same as the username in the URL
    if (user.name !== username) {
      return res.status(403).json({ error: 'Not authorized to view these appointments' });
    }

    const appointments = await Appointment.find({ username })
      .populate('doctorId', 'name department')
      .sort({ date: 1, time: 1 });

    res.json(appointments || []);
  } catch (error) {
    console.error('Error fetching appointments:', error);
    // Return empty array instead of error
    res.json([]);
  }
});

// Create new appointment
app.post('/api/appointments', authenticateToken, async (req, res) => {
  const { doctorId, date, time, symptoms, username } = req.body;

  if (!doctorId || !date || !time || !symptoms || !username) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  try {
    // Verify the requesting user matches the username
    const tokenUser = req.user;
    const user = await User.findById(tokenUser.id);
    if (!user || user.name !== username) {
      return res.status(403).json({ error: 'Not authorized to create appointment for this user' });
    }

    const appointmentDate = new Date(date);
    const now = new Date();

    // Check if date is in the future
    if (appointmentDate < now) {
      return res.status(400).json({ error: 'Appointment date must be in the future' });
    }

    // Check if date is within 6 months from today
    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    if (appointmentDate > sixMonthsLater) {
      return res.status(400).json({ error: 'Appointment date must be within 6 months from today' });
    }

    // Validate: time is within working hours (09:00 to 18:00)
    const [hour, minute] = time.split(':').map(Number);
    const totalMinutes = hour * 60 + minute;
    if (totalMinutes < 540 || totalMinutes > 1080) {
      return res.status(400).json({ error: 'Appointments must be booked between 09:00 and 18:00' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Get the weekday (e.g., "Monday")
    const weekday = appointmentDate.toLocaleString('en-US', { weekday: 'long' });

    // Check availability
    if (!doctor.availability || !doctor.availability[weekday] || !doctor.availability[weekday].includes(time)) {
      return res.status(400).json({ error: 'Selected time slot is not available' });
    }

    // Check for any existing appointment at the same time (for any user)
    const existingAppointment = await Appointment.findOne({
      doctorId,
      date,
      time
    });

    if (existingAppointment) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    const newAppointment = new Appointment({
      doctorId,
      date,
      time,
      symptoms,
      username
    });

    await newAppointment.save();
    res.status(201).json({
      message: 'Appointment booked successfully',
      appointment: newAppointment
    });
  } catch (error) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// Update appointment
app.put('/api/appointments/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { doctorId, date, time, symptoms, username } = req.body;

  try {
    // Verify the requesting user matches the username
    const tokenUser = req.user;
    const user = await User.findById(tokenUser.id);
    if (!user || user.name !== username) {
      return res.status(403).json({ error: 'Not authorized to update this appointment' });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.username !== username) {
      return res.status(403).json({ error: 'Not authorized to update this appointment' });
    }

    // Validate new date and time
    const appointmentDate = new Date(date);
    const now = new Date();

    if (appointmentDate < now) {
      return res.status(400).json({ error: 'Appointment date must be in the future' });
    }

    const sixMonthsLater = new Date();
    sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
    if (appointmentDate > sixMonthsLater) {
      return res.status(400).json({ error: 'Appointment date must be within 6 months from today' });
    }

    const [hour, minute] = time.split(':').map(Number);
    const totalMinutes = hour * 60 + minute;
    if (totalMinutes < 540 || totalMinutes > 1080) {
      return res.status(400).json({ error: 'Appointments must be booked between 09:00 and 18:00' });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    const weekday = appointmentDate.toLocaleString('en-US', { weekday: 'long' });
    if (!doctor.availability || !doctor.availability[weekday] || !doctor.availability[weekday].includes(time)) {
      return res.status(400).json({ error: 'Selected time slot is not available' });
    }

    // Check for existing appointment at the same time (excluding current appointment)
    const existingAppointment = await Appointment.findOne({
      doctorId,
      date,
      time,
      _id: { $ne: id }
    });

    if (existingAppointment) {
      return res.status(409).json({ error: 'This time slot is already booked' });
    }

    appointment.doctorId = doctorId;
    appointment.date = date;
    appointment.time = time;
    appointment.symptoms = symptoms;

    await appointment.save();
    res.json({
      message: 'Appointment updated successfully',
      appointment
    });
  } catch (error) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: 'Failed to update appointment' });
  }
});

// Delete appointment
app.delete('/api/appointments/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { username } = req.body;

    // Verify the requesting user matches the username
    const tokenUser = req.user;
    const user = await User.findById(tokenUser.id);
    if (!user || user.name !== username) {
      return res.status(403).json({ error: 'Not authorized to delete this appointment' });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    if (appointment.username !== username) {
      return res.status(403).json({ error: 'Not authorized to delete this appointment' });
    }

    await Appointment.findByIdAndDelete(id);
    res.json({ message: 'Appointment deleted successfully' });
  } catch (error) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: 'Failed to delete appointment' });
  }
});

app.get("/api/check-auth", async (req, res) => {
  try {
    if (req.session.userId) {
      const user = await User.findById(req.session.userId);
      if (user) {
        res.json({ user: { name: user.name, id: user._id } });
      } else {
        res.json({ user: null });
      }
    } else {
      res.json({ user: null });
    }
  } catch (error) {
    console.error('Auth check error:', error);
    res.json({ user: null });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie("connect.sid"); // Clear session cookie
    res.json({ message: "Logged out successfully" });
  });
});

// Move static file serving to the end
app.use(express.static(path.join(__dirname, "public")));
app.get('*', (_, res) => {
  res.sendFile(path.resolve(__dirname, "public", "index.html"));
});

const doctorData = [
  {
    name: "Dr. Aryan Roy",
    img: "https://randomuser.me/api/portraits/men/31.jpg",
    department: "Cardiology",
    qualification: "MBBS, MD (Cardiology)",
    experience: "12+ Years",
    clinic: "Fortis Heart Care",
    languages: "English, Hindi, Bengali",
    email: "aryan.roy@mediplus.in",
    fee: "₹800",
    rating: "★★★★☆ (4.5/5)",
    availability: {
      Monday: ["10:00", "11:00", "12:00", "13:00"],
      Tuesday: ["10:00", "11:00", "12:00", "13:00"],
      Wednesday: ["10:00", "11:00", "12:00", "13:00"],
      Thursday: ["10:00", "11:00", "12:00", "13:00"],
      Friday: ["10:00", "11:00", "12:00", "13:00"]
    }
  },
  {
    name: "Dr. Meera Das",
    img: "https://randomuser.me/api/portraits/women/45.jpg",
    department: "Neurology",
    qualification: "MBBS, DM (Neurology)",
    experience: "9+ Years",
    clinic: "BrainWave Neuro Clinic",
    languages: "English, Hindi, Odia",
    email: "meera.das@mediplus.in",
    fee: "₹950",
    rating: "★★★★☆ (4.6/5)",
    availability: {
      Tuesday: ["11:00", "12:00", "13:00", "14:00"],
      Wednesday: ["11:00", "12:00", "13:00", "14:00"],
      Thursday: ["11:00", "12:00", "13:00", "14:00"],
      Friday: ["11:00", "12:00", "13:00", "14:00"],
      Saturday: ["11:00", "12:00", "13:00", "14:00"]
    }
  },
  {
    name: "Dr. Raghav Singh",
    img: "https://randomuser.me/api/portraits/men/44.jpg",
    department: "Orthopedics",
    qualification: "MBBS, MS (Ortho)",
    experience: "10+ Years",
    clinic: "OrthoPlus Bone Care",
    languages: "English, Hindi, Punjabi",
    email: "raghav.singh@mediplus.in",
    fee: "₹700",
    rating: "★★★★☆ (4.3/5)",
    availability: {
      Monday: ["14:00", "15:00", "16:00", "17:00"],
      Tuesday: ["14:00", "15:00", "16:00", "17:00"],
      Wednesday: ["14:00", "15:00", "16:00", "17:00"],
      Thursday: ["14:00", "15:00", "16:00", "17:00"],
      Friday: ["14:00", "15:00", "16:00", "17:00"]
    }
  },
  {
    name: "Dr. Ananya Sharma",
    img: "https://randomuser.me/api/portraits/women/68.jpg",
    department: "Pediatrics",
    qualification: "MBBS, DCH",
    experience: "8+ Years",
    clinic: "Happy Kids Health",
    languages: "English, Hindi, Marathi",
    email: "ananya.sharma@mediplus.in",
    fee: "₹600",
    rating: "★★★★☆ (4.7/5)",
    availability: {
      Wednesday: ["09:00", "10:00", "11:00", "12:00"],
      Thursday: ["09:00", "10:00", "11:00", "12:00"],
      Friday: ["09:00", "10:00", "11:00", "12:00"],
      Saturday: ["09:00", "10:00", "11:00", "12:00"],
      Sunday: ["09:00", "10:00", "11:00", "12:00"]
    }
  },
  {
    name: "Dr. Suman Ghosh",
    img: "https://randomuser.me/api/portraits/women/53.jpg",
    department: "Dermatology",
    qualification: "MBBS, MD (Skin & VD)",
    experience: "11+ Years",
    clinic: "DermaGlow Skin Center",
    languages: "English, Hindi, Bengali",
    email: "suman.ghosh@mediplus.in",
    fee: "₹750",
    rating: "★★★★☆ (4.4/5)",
    availability: {
      Monday: ["15:00", "16:00", "17:00", "18:00"],
      Tuesday: ["15:00", "16:00", "17:00", "18:00"],
      Wednesday: ["15:00", "16:00", "17:00", "18:00"],
      Thursday: ["15:00", "16:00", "17:00", "18:00"]
    }
  },
  {
    name: "Dr. Vikram Patel",
    img: "https://randomuser.me/api/portraits/men/67.jpg",
    department: "General Medicine",
    qualification: "MBBS, MD (General Medicine)",
    experience: "15+ Years",
    clinic: "MediPlus General Care",
    languages: "English, Hindi, Gujarati",
    email: "vikram.patel@mediplus.in",
    fee: "₹500",
    rating: "★★★★★ (4.9/5)",
    availability: {
      Monday: ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"],
      Tuesday: ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"],
      Wednesday: ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"],
      Thursday: ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"],
      Friday: ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"],
      Saturday: ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00"]
    }
  }
];

// RUN ONCE TO SEED DOCTORS
const seedDoctors = async () => {
  try {
    const existingDoctors = await Doctor.find({});
    if (existingDoctors.length === doctorData.length) {
      return;
    }
    let added = 0;
    for (const doc of doctorData) {
      const exists = await Doctor.findOne({ email: doc.email });
      if (!exists) {
        await Doctor.create(doc);
        added++;
      }
    }
  } catch (error) {
    console.error("Error seeding doctors:", error);
  }
};
seedDoctors();

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mediplus', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
  .then(() => {
    console.log('✅ Connected to MongoDB');
    // Start Server
    startServer();
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    console.log('⚠️ Starting server without MongoDB connection...');
    startServer();
  });

function startServer() {
  app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use. Please try a different port or kill the process using this port.`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });
}