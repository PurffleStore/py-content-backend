import dotenv from 'dotenv';

// Load local .env only when it exists locally.
// In Railway, values will come from Railway Variables.
dotenv.config();

console.log('Configuration loaded');
console.log('   OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? `set (${process.env.OPENAI_API_KEY.length} chars)` : 'NOT SET');
console.log('   ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? `set (${process.env.ANTHROPIC_API_KEY.length} chars)` : 'NOT SET');
console.log('   PORT:', process.env.PORT || 'NOT SET');

export const config = {
  apiKey: process.env.ANTHROPIC_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};

export default config;