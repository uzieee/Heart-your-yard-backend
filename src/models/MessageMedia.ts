import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "database";

export interface MessageMediaAttributes {
  id: string;
  message_id: string;
  media_url: string;
  media_type: "image" | "video";
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MessageMediaCreationAttributes
  extends Optional<
    MessageMediaAttributes,
    "id" | "file_name" | "file_size" | "mime_type" | "created_at" | "updated_at"
  > {}

class MessageMedia
  extends Model<MessageMediaAttributes, MessageMediaCreationAttributes>
  implements MessageMediaAttributes
{
  public id!: string;
  public message_id!: string;
  public media_url!: string;
  public media_type!: "image" | "video";
  public file_name!: string | null;
  public file_size!: number | null;
  public mime_type!: string | null;
  public created_at!: Date;
  public updated_at!: Date;
}

MessageMedia.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    message_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "messages",
        key: "id",
      },
    },
    media_url: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    media_type: {
      type: DataTypes.ENUM("image", "video"),
      allowNull: false,
    },
    file_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    file_size: {
      type: DataTypes.BIGINT,
      allowNull: true,
    },
    mime_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
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
    tableName: "message_media",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

export default MessageMedia;

