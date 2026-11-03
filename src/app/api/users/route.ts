import { requireAdmin } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";
import { usersQuery, usersSourceQuery } from "@/lib/user-data";
import { getUsers } from "@/lib/users";

export const maxDuration = 60;
export async function GET(request: Request) {
  try {
    await requireAdmin();
    return json(await getUsers(usersQuery(request), usersSourceQuery(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
