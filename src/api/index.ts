import app from "../server";

// Handler untuk Vercel (tanpa @vercel/node)
export default function handler(req: any, res: any) {
  app(req, res);
}
