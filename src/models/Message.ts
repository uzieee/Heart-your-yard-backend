import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "database";

export interface MessageAttributes {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string | null;
  message_type: "text" | "image" | "video";
  created_at: Date;
  updated_at: Date;
}

export interface MessageCreationAttributes
  extends Optional<
    MessageAttributes,
    "id" | "content" | "created_at" | "updated_at"
  > {}

class Message
  extends Model<MessageAttributes, MessageCreationAttributes>
  implements MessageAttributes
{
  public id!: string;
  public sender_id!: string;
  public receiver_id!: string;
  public content!: string | null;
  public message_type!: "text" | "image" | "video";
  public created_at!: Date;
  public updated_at!: Date;
}

Message.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    sender_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    receiver_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    message_type: {
      type: DataTypes.ENUM("text", "image", "video"),
      allowNull: false,
      defaultValue: "text",
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
  },
  {
    sequelize,
    tableName: "messages",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default Message;

