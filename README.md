# MediPlus

MediPlus is an intelligent health management platform designed to streamline and enhance the healthcare experience. The website includes essential features such as user registration and secure login, with all data efficiently stored in a dedicated database. At its core, MediPlus offers two powerful tools: an Appointment Scheduler that simplifies booking with healthcare providers, and a Disease Prediction system that leverages data to offer early health insights.

# Hospital Management System

## Setup Instructions

1. Clone the repository
2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory with the following variables:

   ```
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Database Configuration
   MONGODB_URI=mongodb://127.0.0.1:27017/mediplus

   # Security
   JWT_SECRET=your_jwt_secret_here
   SESSION_SECRET=your_session_secret_here

   # Frontend URL (for CORS)
   FRONTEND_URL=http://localhost:3000

   # OpenAI Configuration
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. Start the development server:
   ```bash
   npm start
   ```

## Environment Variables

The following environment variables are required:

- `PORT`: The port number for the server (default: 3000)
- `NODE_ENV`: The environment (development/production)
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key for JWT token generation
- `SESSION_SECRET`: Secret key for session management
- `FRONTEND_URL`: URL of the frontend application (for CORS)
- `OPENAI_API_KEY`: API key for OpenAI integration

## Security Notes

- Never commit the `.env` file to version control
- Use strong, unique values for all secret keys
- In production, ensure all sensitive data is properly secured
