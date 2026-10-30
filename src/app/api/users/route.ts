import { requireAdmin } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";
import { usersQuery } from "@/lib/user-data";
import { getUsers } from "@/lib/users";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    return json(await getUsers(usersQuery(request)));
  } catch (error) {
    return errorResponse(error);
  }
}
