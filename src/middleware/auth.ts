// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import config from '../config';

export interface AuthRequest extends Request {
  headers: Request['headers'];
  userId?: string;
  userRole?: string;
  file?: any;
  body: any;
  query: any;
  params: any;
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };
    
    // Find the user
    const user = await User.findOne({ userId: decoded.userId });
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
    
    // Attach user info to request
    req.userId = user.userId;
    req.userRole = user.role;
    
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Role-based authentication
export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};