import { redirect } from "next/navigation";

export default function Home() {
  // Middleware will redirect to /login if the user is not authenticated.
  // Authenticated users land on the dashboard.
  redirect("/dashboard");
}
