
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

const isStudentRoute = createRouteMatcher(["/user/(.*)"]);
const isTeacherRoute = createRouteMatcher(["/teacher/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();

  // If no user is signed in, let Clerk handle the redirect
  if (!userId) {
    return;
  }

  // Get the ClerkClient instance by calling clerkClient()
  const client = await clerkClient();
  // Fetch user data to get publicMetadata
  const user = await client.users.getUser(userId);
  const userRole =
    (user.publicMetadata?.userType as "student" | "teacher") || "student";

  // Debugging log to confirm userRole
  console.log(
    "Middleware - userId:",
    userId,
    "userRole:",
    userRole,
    "Path:",
    req.nextUrl.pathname
  );

  if (isStudentRoute(req) && userRole !== "student") {
    const url = new URL("/teacher/courses", req.url);
    return NextResponse.redirect(url);
  }

  if (isTeacherRoute(req) && userRole !== "teacher") {
    const url = new URL("/user/courses", req.url);
    return NextResponse.redirect(url);
  }

  // No redirect needed, proceed with the request
  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

