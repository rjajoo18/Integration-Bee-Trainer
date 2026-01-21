import bcrypt from "bcryptjs";

export async function hashPassword(pw: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pw, salt);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}
