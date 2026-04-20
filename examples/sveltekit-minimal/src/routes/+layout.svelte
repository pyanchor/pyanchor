<script lang="ts">
  // SvelteKit reads PUBLIC_* env at build time; private envs stay
  // server-side. We only need the public flag + token here because
  // the bootstrap script tag is rendered into the document head.
  // In production gate the whole bootstrap behind an existing-auth
  // middleware (see ../nextjs-nextauth-gate/ for the pattern).
  import { PUBLIC_PYANCHOR_DEVTOOLS_ENABLED, PUBLIC_PYANCHOR_TOKEN } from "$env/static/public";

  const devtoolsEnabled = PUBLIC_PYANCHOR_DEVTOOLS_ENABLED === "true";
  const token = PUBLIC_PYANCHOR_TOKEN ?? "";
</script>

<svelte:head>
  {#if devtoolsEnabled && token}
    <script
      src="/_pyanchor/bootstrap.js"
      defer
      data-pyanchor-token={token}
      data-pyanchor-trusted-hosts="localhost,127.0.0.1"
    ></script>
  {/if}
</svelte:head>

<slot />

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
    background: #0b1020;
    color: #edf1ff;
    min-height: 100vh;
    display: grid;
    place-items: center;
  }
</style>
