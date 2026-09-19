// Footer year
document.getElementById("year").textContent = new Date().getFullYear();

function buildYouTubeEmbedUrl(videoId) {
  const params = new URLSearchParams({ rel: "0", modestbranding: "1" });
  const origin = window.location.origin;

  if (origin && origin !== "null" && !origin.startsWith("file:")) {
    params.set("origin", origin);
  }

  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}

function isLocalFilePreview() {
  return window.location.protocol === "file:";
}

function getVideoSourceUrl(video) {
  const src = video.querySelector("source")?.getAttribute("src");
  if (src) {
    return new URL(src, window.location.href).href;
  }
  if (video.currentSrc) {
    return video.currentSrc;
  }
  return null;
}

// Chrome often cannot scrub MP4s unless the file is "fast start" encoded and/or
// the server supports HTTP byte-range (206) responses. This loads the file into
// memory as a fallback when native seeking is broken.
function loadVideoAsBlob(video) {
  if (video.dataset.seekFix === "loading" || video.dataset.seekFix === "done") {
    return;
  }

  const sourceUrl = getVideoSourceUrl(video);
  if (!sourceUrl || sourceUrl.startsWith("blob:")) {
    return;
  }

  video.dataset.seekFix = "loading";

  fetch(sourceUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.blob();
    })
    .then((blob) => {
      const blobUrl = URL.createObjectURL(blob);
      const savedTime = video.currentTime;
      const wasPlaying = !video.paused;

      video.querySelectorAll("source").forEach((el) => el.remove());
      video.src = blobUrl;
      video.dataset.seekFix = "done";

      video.addEventListener(
        "loadedmetadata",
        () => {
          if (savedTime > 0) {
            video.currentTime = savedTime;
          }
          if (wasPlaying) {
            video.play().catch(() => {});
          }
        },
        { once: true }
      );
    })
    .catch(() => {
      video.dataset.seekFix = "";
    });
}

function ensureVideoSeekingWorks(video) {
  if (video.dataset.seekFix === "done" || video.dataset.seekFix === "loading") {
    return;
  }

  if (isLocalFilePreview()) {
    return;
  }

  if (!video.duration || !Number.isFinite(video.duration)) {
    return;
  }

  const noSeekableRange =
    video.seekable.length === 0 || video.seekable.end(0) === 0;

  if (noSeekableRange) {
    loadVideoAsBlob(video);
    return;
  }

  const target = Math.min(0.5, video.duration * 0.1);
  if (target <= 0) {
    return;
  }

  const previousTime = video.currentTime;
  video.currentTime = target;

  requestAnimationFrame(() => {
    const seekWorked = Math.abs(video.currentTime - target) < 0.2;
    video.currentTime = previousTime;

    if (!seekWorked) {
      loadVideoAsBlob(video);
    }
  });
}

document.querySelectorAll("video.project-media").forEach((video) => {
  video.addEventListener("loadedmetadata", () => ensureVideoSeekingWorks(video), {
    once: true,
  });
});

// Project video carousels
document.querySelectorAll("[data-carousel]").forEach((carousel) => {
  const slides = carousel.querySelectorAll(".project-carousel-slide");
  const dots = carousel.querySelectorAll(".project-carousel-dot");
  const prevBtn = carousel.querySelector(".project-carousel-btn--prev");
  const nextBtn = carousel.querySelector(".project-carousel-btn--next");
  let index = 0;

  function pauseAllMedia() {
    slides.forEach((slide) => {
      const video = slide.querySelector("video");
      if (video) {
        video.pause();
      }

      const iframe = slide.querySelector(".project-carousel-iframe");
      if (iframe) {
        iframe.removeAttribute("src");
      }
    });
  }

  function loadEmbedForSlide(slideIndex) {
    const slide = slides[slideIndex];
    const iframe = slide?.querySelector(".project-carousel-iframe");
    const videoId = iframe?.dataset.youtubeId;

    if (!iframe || !videoId || iframe.getAttribute("src")) {
      return;
    }

    if (isLocalFilePreview()) {
      return;
    }

    iframe.setAttribute("src", buildYouTubeEmbedUrl(videoId));
  }

  function goTo(i) {
    index = (i + slides.length) % slides.length;

    slides.forEach((slide, n) => {
      slide.classList.toggle("is-active", n === index);
    });

    dots.forEach((dot, n) => {
      const active = n === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", active ? "true" : "false");
    });

    pauseAllMedia();
    loadEmbedForSlide(index);

    const activeVideo = slides[index]?.querySelector("video.project-media");
    if (activeVideo?.readyState >= 1) {
      ensureVideoSeekingWorks(activeVideo);
    }
  }

  prevBtn.addEventListener("click", () => goTo(index - 1));
  nextBtn.addEventListener("click", () => goTo(index + 1));

  dots.forEach((dot) => {
    dot.addEventListener("click", () => goTo(Number(dot.dataset.goto)));
  });
});
