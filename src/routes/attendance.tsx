import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * /attendance has been consolidated into /main-book.
 * This route exists only to redirect any old links/bookmarks so nothing
 * breaks after the rename.
 */
export const Route = createFileRoute("/attendance")({
  beforeLoad: () => {
    throw redirect({ to: "/main-book" });
  },
});
