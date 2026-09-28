import mongoose from 'mongoose';

// Connect to MongoDB when a connection string is available, while keeping local setup optional.
async function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    console.log('MongoDB is not configured; using in-memory analysis storage.');
    return false;
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 1000 });
    console.log('MongoDB connected.');
    return true;
  } catch (error) {
    console.warn(`MongoDB unavailable; using in-memory analysis storage. ${error.message}`);
    return false;
  }
}

export { connectToDatabase };