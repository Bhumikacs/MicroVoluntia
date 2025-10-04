// =====================
// Dependencies
// =====================
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const path = require("path");
const multer = require("multer"); // for file uploads
const fs = require("fs");
const PDFDocument = require("pdfkit");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files and uploaded images
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public/uploads"))); 

// =====================
// MongoDB Connection
// =====================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch(err => console.error("MongoDB connection error:", err));

// =====================
// User Schema & Model
// =====================
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", userSchema);

// =====================
// Event Schema & Model
// =====================
const eventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  date: { type: Date, required: true },
  location: { type: String, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String },
  createdAt: { type: Date, default: Date.now }
});
const Event = mongoose.model("Event", eventSchema);

// =====================
// Pre-Registration Schema & Model
// =====================
const preRegistrationSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  dob: { type: Date, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  event: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const PreRegistration = mongoose.model("PreRegistration", preRegistrationSchema);

// =====================
// Multer Setup for Image Upload
// =====================
const uploadFolder = "public/uploads";
if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadFolder),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + ext);
  }
});
const upload = multer({ storage });

// =====================
// Signup Route
// =====================
app.post("/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =====================
// Login Route
// =====================
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Incorrect password" });

    res.status(200).json({ 
      message: "Login successful", 
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =====================
// Get User by ID
// =====================
app.get("/user/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =====================
// Update User by ID
// =====================
app.put("/user/:id", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const updateData = { name, email };
    if (password && password !== "********") {
      updateData.password = await bcrypt.hash(password, 10);
    }
    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Profile updated successfully", user });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =====================
// Add Event (Admin) with Image
// =====================
app.post("/admin/add_event", upload.single("image"), async (req, res) => {
  try {
    const { name, date, location, description } = req.body;
    if (!name || !date || !location || !description)
      return res.status(400).json({ message: "Please provide all required fields" });

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return res.status(400).json({ message: "Invalid date format" });

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const existing = await Event.findOne({ name, date: parsedDate, location });
    if (existing) return res.status(400).json({ message: "Event already exists" });

    const newEvent = new Event({ name, date: parsedDate, location, description, imageUrl });
    await newEvent.save();
    res.status(201).json({ message: "Event added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =====================
// Get All Events
// =====================
app.get("/events", async (req, res) => {
  try {
    const events = await Event.find().sort({ date: 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =====================
// Pre-Registration Route
// =====================
app.post("/pre_register", async (req, res) => {
  try {
    const { fullname, dob, email, phone, event } = req.body;
    const existing = await PreRegistration.findOne({ email, event });
    if (existing) return res.status(400).json({ message: "Already pre-registered for this event" });

    const newPreReg = new PreRegistration({ fullname, dob, email, phone, event });
    await newPreReg.save();
    res.status(201).json({ message: "Pre-registration successful" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =====================
// User Task Schema & Model
// =====================
const taskSchema = new mongoose.Schema({
  email: { type: String, required: true },
  taskName: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});
const Task = mongoose.model("Task", taskSchema);

// =====================
// Assign Task Route (User tasks)
// =====================
app.post("/assign_task", async (req, res) => {
  try {
    const { email, taskName } = req.body;
    if (!email || !taskName) return res.status(400).json({ message: "Email and task are required" });

    const newTask = new Task({ email, taskName });
    await newTask.save();
    res.status(201).json({ message: "Task assigned successfully" });
  } catch (err) {
    console.error("Error in /assign_task:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =====================
// Get My Tasks (User)
// =====================
app.get("/my_tasks/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const tasks = await Task.find({ email }).sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    console.error("Error in /my_tasks:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// =====================
// Admin Task Schema & Model (New Collection)
// =====================
const adminTaskSchema = new mongoose.Schema({
  taskName: { type: String, required: true },
  description: { type: String },
  deadline: { type: Date },
  createdAt: { type: Date, default: Date.now }
});
const AdminTask = mongoose.model("AdminTask", adminTaskSchema, "adminCreatedTasks");

// =====================
// Admin Task Routes
// =====================

// Create Admin Task
app.post("/admin/tasks", async (req, res) => {
  try {
    const { taskName, description, deadline } = req.body;
    if (!taskName) return res.status(400).json({ message: "Task name is required" });

    const newTask = new AdminTask({ taskName, description, deadline });
    await newTask.save();
    res.status(201).json({ message: "Admin task created successfully", task: newTask });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all Admin Tasks
app.get("/admin/tasks", async (req, res) => {
  try {
    const tasks = await AdminTask.find().sort({ createdAt: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Update Admin Task
app.put("/admin/tasks/:id", async (req, res) => {
  try {
    const { taskName, description, deadline } = req.body;
    const updatedTask = await AdminTask.findByIdAndUpdate(
      req.params.id,
      { taskName, description, deadline },
      { new: true }
    );
    if (!updatedTask) return res.status(404).json({ message: "Task not found" });
    res.json({ message: "Admin task updated successfully", task: updatedTask });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Delete Admin Task
app.delete("/admin/tasks/:id", async (req, res) => {
  try {
    const deletedTask = await AdminTask.findByIdAndDelete(req.params.id);
    if (!deletedTask) return res.status(404).json({ message: "Task not found" });
    res.json({ message: "Admin task deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));