import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function requireUserId(): Promise<number> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      console.error('[AUTH] No session or user in session');
      throw new Error("Unauthorized");
    }
    
    const userId = (session.user as any).id;
    
    if (!userId) {
      console.error('[AUTH] User ID missing from session:', session.user);
      throw new Error("Invalid user session - no ID");
    }
    
    // Handle both string and number IDs
    const numericId = typeof userId === 'string' ? parseInt(userId, 10) : userId;
    
    if (!Number.isInteger(numericId) || numericId <= 0) {
      console.error('[AUTH] Invalid user ID format:', userId);
      throw new Error("Invalid user session - malformed ID");
    }
    
    return numericId;
  } catch (error) {
    console.error('[AUTH] requireUserId failed:', error);
    throw error;
  }
}