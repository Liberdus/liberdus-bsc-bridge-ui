export const REFRESH_ICON = `
  <span class="refresh-button__icon" data-refresh-icon aria-hidden="true">
    <svg
      class="refresh-button__icon-svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  </span>
`;

export const MIN_REFRESH_SPIN_MS = 1000;

export function setRefreshButtonLoading(button, isLoading) {
  if (!button) return;

  const loading = !!isLoading;
  button.disabled = loading;
  button.classList.toggle('is-loading', loading);

  if (loading) {
    button.setAttribute('aria-busy', 'true');
    return;
  }

  button.removeAttribute('aria-busy');
}

export async function waitForMinimumRefreshSpin(startedAt) {
  const remaining = MIN_REFRESH_SPIN_MS - (Date.now() - startedAt);
  if (remaining <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, remaining));
}
