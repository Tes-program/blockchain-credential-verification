 
 
import mongoose from 'mongoose';
import config from './index';

export class DatabaseManager {
 /**
   * Connect to MongoDB
   */
  async connectDatabase(): Promise<void> {
    try {
      if (mongoose.connection.readyState === 1) {
        console.log('Already connected to MongoDB');
        return;
      }

      console.log('Connecting to MongoDB...');
      await mongoose.connect(config.mongodb.uri);
      console.log('✅ MongoDB connected successfully');
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  /**
   * Disconnect from MongoDB
   */
  async disconnectDatabase(): Promise<void> {
    try {
      } catch (error) {
        console.error('Error disconnecting from MongoDB:', error);
      }
    } catch (error) {
      console.error('Error disconnecting from MongoDB:', error);
    }
  }
