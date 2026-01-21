import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function requireUserId(): Promise<number> {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (user?.id === undefined || user?.id === null) throw new Error("Unauthorized");

  const idNum = Number(user.id);
  if (!Number.isInteger(idNum)) throw new Error("Unauthorized");

  return idNum;
}
