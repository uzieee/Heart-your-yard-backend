import { DataTypes, Model, Optional } from "sequelize";
import sequelize from "database";

export interface MessageReadAttributes {
  id: string;
  message_id: string;
  user_id: string;
  read_at: Date;
}

export interface MessageReadCreationAttributes
  extends Optional<MessageReadAttributes, "id" | "read_at"> {}

class MessageRead
  extends Model<MessageReadAttributes, MessageReadCreationAttributes>
  implements MessageReadAttributes
{
  public id!: string;
  public message_id!: string;
  public user_id!: string;
  public read_at!: Date;
}

MessageRead.init(
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
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },
    read_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "message_reads",
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ["message_id", "user_id"],
        name: "idx_message_reads_unique",
      },
    ],
  }
);

export default MessageRead;

