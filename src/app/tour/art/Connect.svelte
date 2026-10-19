<script lang="ts">
  // Static illustration.
</script>

<svg viewBox="0 0 440 300" aria-hidden="true">
  <!-- Laptop -->
  <rect x="24" y="92" width="132" height="86" rx="6" class="panel" />
  <rect x="32" y="100" width="116" height="62" rx="3" class="bed" />
  <path d="M14 182h152l-10 10H24z" class="panel" />
  <rect x="40" y="108" width="54" height="10" rx="5" class="go-tint" />
  <circle cx="48" cy="113" r="2.5" class="go-fill" />
  <text x="56" y="116" class="mono-text go-fill" font-size="7">IDLE</text>
  <rect x="40" y="128" width="80" height="6" rx="3" class="line-fill" />
  <rect x="40" y="140" width="56" height="6" rx="3" class="line-fill" />

  <!-- Cable -->
  <path d="M156 160 C 200 160, 200 210, 250 210" fill="none" class="cable" stroke-width="3" />
  <path d="M156 160 C 200 160, 200 210, 250 210" fill="none" class="beam data" stroke-width="3" />

  <!-- Laser gantry -->
  <rect x="250" y="70" width="170" height="170" rx="6" class="bed" />
  <rect x="250" y="70" width="170" height="170" rx="6" fill="none" class="frame-stroke" />
  <g class="gantry">
    <rect x="250" y="118" width="170" height="10" rx="2" class="panel" />
    <g class="head">
      <rect x="318" y="108" width="24" height="30" rx="3" class="panel" />
      <circle cx="330" cy="142" r="3" class="sig-fill" />
    </g>
  </g>

  <g transform="translate(250 262)">
    <rect width="132" height="24" rx="12" class="chip" />
    <text x="66" y="16" text-anchor="middle" class="mono-text txt" font-size="10">virtual machine</text>
  </g>
</svg>

<style>
  .cable {
    stroke: var(--ol-border-strong);
  }

  .data {
    stroke-dasharray: 6 14;
    animation: flow 1.2s linear infinite;
  }

  .head {
    animation: slide 3.2s ease-in-out infinite alternate;
  }

  .gantry {
    animation: rise 4.4s ease-in-out infinite alternate;
  }

  @keyframes flow {
    to {
      stroke-dashoffset: -40;
    }
  }

  @keyframes slide {
    from {
      transform: translateX(-56px);
    }
    to {
      transform: translateX(56px);
    }
  }

  @keyframes rise {
    from {
      transform: translateY(-30px);
    }
    to {
      transform: translateY(70px);
    }
  }
</style>
