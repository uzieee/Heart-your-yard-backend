import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "database";

export interface UserAttributes {
  id: string;
  username: string;
  email: string;
  password: string;
  image: string;
  provider: string;
  blocked: boolean;
  is_verified_email: boolean;
  subscription_plan: "FREE" | "PREMIUM";
  role: "ADMIN" | "USER";
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface UserCreationAttributes
  extends Optional<
    UserAttributes,
    | "id"
    | "blocked"
    | "is_verified_email"
    | "subscription_plan"
    | "role"
    | "created_at"
    | "updated_at"
    | "deleted_at"
  > {}

class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  public id!: string;
  public username!: string;
  public email!: string;
  public password!: string;
  public image!: string;
  public provider!: string;
  public blocked!: boolean;
  public is_verified_email!: boolean;
  public subscription_plan!: "FREE" | "PREMIUM";
  public role!: "ADMIN" | "USER";
  public created_at!: Date;
  public updated_at!: Date;
  public deleted_at!: Date | null;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
      unique: true,
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    image: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    blocked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    is_verified_email: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    subscription_plan: {
      type: DataTypes.ENUM("FREE", "PREMIUM"),
      allowNull: false,
      defaultValue: "FREE",
    },
    role: {
      type: DataTypes.ENUM("ADMIN", "USER"),
      allowNull: false,
      defaultValue: "USER",
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "users",
    timestamps: true,
    paranoid: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
  }
);

export default User;








