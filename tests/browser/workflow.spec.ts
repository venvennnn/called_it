import { test, expect } from "@playwright/test";
test("director workflow, overlay authorization, correction and mobile layout", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Calls locked. Attempt underway." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Demo preview" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /YES Survived/ }).click();
  await page.getByRole("button", { name: "Confirm result" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm Yes?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm & reveal result" }).click();
  await expect(
    page.getByRole("heading", { name: "The result is in. Who called it?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create a question" }).click();
  await page
    .getByLabel("The question", { exact: true })
    .fill("Will the smoke test succeed?");
  await page.getByRole("button", { name: "Publish & open calls" }).click();
  await expect(
    page.getByRole("heading", { name: "One attempt. What’s your call?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Chat command").fill("!call 5 no 80");
  await page.getByRole("button", { name: "Send demo call" }).click();
  await expect(page.getByRole("status")).toContainText("Demo call accepted");
  await page.getByRole("button", { name: "Live room", exact: true }).click();
  await page
    .getByRole("button", { name: "Lock calls & start attempt" })
    .click();
  await expect(page.locator(".overlay-card-body")).toContainText("20%");
  await page.locator(".choice.no").click();
  await page.getByRole("button", { name: "Confirm result" }).click();
  await page.getByRole("button", { name: "Confirm & reveal result" }).click();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.locator(".award").first()).toContainText("96");
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.locator("summary").first().click();
  await expect(page.locator(".forecast-table").first()).toContainText("96.0");
  const auth = await page.request.post("/api/overlay/rotate", {
    headers: { "X-Called-It": "owner", Origin: "http://localhost:5174" },
    data: {},
  });
  const { token } = await auth.json();
  const ctx = await browser.newContext();
  const obs = await ctx.newPage();
  await obs.goto("/overlay#" + token);
  await expect(obs.locator(".overlay-card")).toContainText("NO");
  await obs.reload();
  await expect(obs.locator(".overlay-card")).toContainText("NO");
  const forbidden = await ctx.request.post(
    "http://localhost:5174/api/data/delete",
    {
      headers: { "X-Called-It": "owner", Origin: "http://localhost:5174" },
      data: {},
    },
  );
  expect(forbidden.status()).toBe(403);
  await ctx.close();
  await page.getByRole("button", { name: "Live room", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/called-it-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/called-it-desktop.png", fullPage: true });
});
test("rejects OAuth/CSRF/version conflicts and makes owner resolution idempotent", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Demo preview" }),
  ).toBeVisible();
  const callback = await page.request.get(
    "/auth/twitch/callback?state=forged&code=forged",
  );
  expect(callback.status()).toBe(400);
  const csrf = await page.request.post("/api/overlay/visibility", {
    data: { visible: false },
  });
  expect(csrf.status()).toBe(403);
  const crossOrigin = await page.request.post("/api/overlay/visibility", {
    headers: { "X-Called-It": "owner", Origin: "https://attacker.example" },
    data: { visible: false },
  });
  expect(crossOrigin.status()).toBe(403);
  const headers = {
    "X-Called-It": "owner",
    Origin: "http://localhost:5174",
    "Idempotency-Key": "browser-create-idempotency",
  };
  const input = {
    question: "Will idempotency hold?",
    criterion: "The same mutation is returned once.",
    duration: 45,
    publicDistribution: false,
  };
  const first = await page.request.post("/api/rounds/create", {
    headers,
    data: input,
  });
  expect(first.ok()).toBe(true);
  const round = await first.json();
  const again = await page.request.post("/api/rounds/create", {
    headers,
    data: input,
  });
  expect((await again.json()).id).toBe(round.id);
  const conflict = await page.request.post(`/api/rounds/${round.id}/lock`, {
    headers: { ...headers, "Idempotency-Key": "browser-stale-version" },
    data: { version: 999 },
  });
  expect(conflict.status()).toBe(409);
  const locked = await page.request.post(`/api/rounds/${round.id}/lock`, {
    headers: { ...headers, "Idempotency-Key": "browser-lock" },
    data: { version: round.version },
  });
  const next = await locked.json();
  const resolveHeaders = {
    ...headers,
    "Idempotency-Key": "browser-resolve-once",
  };
  const resolved = await page.request.post(`/api/rounds/${round.id}/resolve`, {
    headers: resolveHeaders,
    data: { version: next.version, outcome: true },
  });
  expect(resolved.ok()).toBe(true);
  const retry = await page.request.post(`/api/rounds/${round.id}/resolve`, {
    headers: resolveHeaders,
    data: { version: next.version, outcome: true },
  });
  expect((await retry.json()).revision).toBe(1);
  const ctx = await browser.newContext();
  const unauthorized = await ctx.request.get("http://localhost:5174/api/state");
  expect(unauthorized.status()).toBe(401);
  await ctx.close();
});
