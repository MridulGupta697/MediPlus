import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema({
  name: String,
  department: String,
  qualification: String,
  experience: String,
  clinic: String,
  languages: String,
  email: String,
  fee: String,
  rating: String,
  img: String,
  availability: {
    Sunday: [String],
    Monday: [String],
    Tuesday: [String],
    Wednesday: [String],
    Thursday: [String],
    Friday: [String],
    Saturday: [String]
  }
});

const Doctor = mongoose.model('Doctor', doctorSchema);
export default Doctor;
