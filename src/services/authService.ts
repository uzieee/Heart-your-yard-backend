import bcrypt from "bcryptjs";
import { QueryTypes } from "sequelize";
import admin from "@/lib/firebase";
import sequelize from "database";
import { RegisterBody } from "@/interface/types";

const SALT_ROUNDS = 10;

export const checkUsernameAvailable = async (
  username: string
): Promise<boolean> => {
  const [result] = await sequelize.query(
    `SELECT id FROM users WHERE username = $1 LIMIT 1`,
    { bind: [username], type: QueryTypes.SELECT }
  );
  return !result;
};

export const checkEmailAvailable = async (
  email: string
): Promise<boolean> => {
  const [result] = await sequelize.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    { bind: [email], type: QueryTypes.SELECT }
  );
  return !result;
};

export const registerUserService = async (body: RegisterBody) => {
  const { username, email, password, image } = body;

  // Check if username is already taken
  const isUsernameAvailable = await checkUsernameAvailable(username);
  if (!isUsernameAvailable) {
    throw { statusCode: 409, message: "Username is already taken" };
  }

  // Check if email is already taken
  const isEmailAvailable = await checkEmailAvailable(email);
  if (!isEmailAvailable) {
    throw { statusCode: 409, message: "Email is already registered" };
  }

  // Create user in Firebase
  const firebaseUser = await admin.auth().createUser({
    email,
    password,
    displayName: username,
  });

  // Hash password
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

  // Save user to database
  const [newUser] = await sequelize.query(
    `INSERT INTO users (username, email, password, image, provider)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, username, email, image, provider, blocked, is_verified_email,
               is_onboarded, subscription_plan, role, created_at, updated_at`,
    {
      bind: [username, email, hashedPassword, image || "", "email"],
      type: QueryTypes.INSERT,
    }
  );

  return {
    user: newUser,
    firebaseUid: firebaseUser.uid,
  };
};

export interface LoginBody {
  email: string;
  password: string;
}

export const loginUserService = async (body: LoginBody) => {
  const { email, password } = body;

  // Find user by email
  const [user] = await sequelize.query(
    `SELECT id, username, email, password, image, provider, blocked, 
            is_verified_email, is_onboarded, subscription_plan, role
     FROM users 
     WHERE email = $1 AND deleted_at IS NULL
     LIMIT 1`,
    { bind: [email], type: QueryTypes.SELECT }
  ) as any[];

  if (!user) {
    throw { statusCode: 401, message: "Invalid email or password" };
  }

  // Check if user is blocked
  if (user.blocked) {
    throw { statusCode: 403, message: "Your account has been blocked" };
  }

  // Check if email is verified
  if (!user.is_verified_email) {
    throw {
      statusCode: 403,
      message: "Please verify your email before logging in",
    };
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw { statusCode: 401, message: "Invalid email or password" };
  }

  // Return user without password
  const { password: _, ...userWithoutPassword } = user;

  return {
    user: userWithoutPassword,
  };
};
