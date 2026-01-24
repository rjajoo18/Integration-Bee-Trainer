import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function requireUserId(): Promise<number> {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    throw new Error("Unauthorized");
  }
  
  const userId = (session.user as any).id;
  
  if (!userId || typeof userId !== 'number') {
    throw new Error("Invalid user session");
  }
  
  return userId;
}