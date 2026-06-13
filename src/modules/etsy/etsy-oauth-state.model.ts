import { model, Schema } from 'mongoose';

interface IEtsyOAuthState {
  state: string;
  userId: string;
  codeVerifier: string;
  marketplace: 'etsy';
  environment: 'production';
  expiresAt: Date;
  consumed: boolean;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const etsyOAuthStateSchema = new Schema<IEtsyOAuthState>(
  {
    state: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    codeVerifier: { type: String, required: true },
    marketplace: { type: String, enum: ['etsy'], default: 'etsy', required: true },
    environment: { type: String, enum: ['production'], default: 'production', required: true },
    expiresAt: { type: Date, required: true, index: true },
    consumed: { type: Boolean, default: false, index: true },
    consumedAt: { type: Date }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

etsyOAuthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EtsyOAuthStateModel = model<IEtsyOAuthState>('EtsyOAuthState', etsyOAuthStateSchema);
