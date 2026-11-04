class Main {
    constructor() {
        this.gravity = 0.1;
        this.x = 0;
        this.y = 0;

        this.canvas = document.getElementById('bgCanvas');
        this.ctx = this.canvas.getContext("2d");
        this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        this.paused = false;
        this.siuuus = 0;
        this.siuuuAudio = document.getElementById("siuuu-audio");
        this.siuuuPlaybackId = 0;
        this.tick = this.update.bind(this);
        this.resizeCanvas();

        this.frame = new Frame(this.canvas, this.getPageLinks());
        this.canvas.addEventListener("pointerdown", (e) => {
            this.pointerStart = this.getCanvasPoint(e);
            this.dragged = false;
        });
        this.canvas.addEventListener("pointermove", (e) => {
            const point = this.getCanvasPoint(e);
            if (this.pointerStart && Math.hypot(point.x - this.pointerStart.x, point.y - this.pointerStart.y) > 8) {
                this.dragged = true;
            }
            this.x = point.x;
            this.y = point.y;
            this.updateHover(point);
        });
        this.canvas.addEventListener("pointerleave", () => {
            this.canvas.classList.remove("link-hover");
            this.pointerStart = null;
        });
        this.canvas.addEventListener("pointercancel", () => {
            this.pointerStart = null;
            this.dragged = true;
        });
        this.canvas.addEventListener("click", (e) => {
            if (this.dragged) return;
            const point = this.getCanvasPoint(e);
            const linkTarget = this.frame.getLinkAt(point.x, point.y);

            if (linkTarget) {
                if (linkTarget.target === "_blank") {
                    window.open(linkTarget.href, "_blank", "noopener");
                } else {
                    window.location.href = linkTarget.href;
                }
            }
        });
        this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
        this.resizeObserver.observe(this.canvas);
        this.setupControls();
        this.setPaused(this.reducedMotion.matches);
        this.reducedMotion.addEventListener("change", (event) => this.setPaused(event.matches));
        document.addEventListener("visibilitychange", () => {
            cancelAnimationFrame(this.animationId);
            if (!document.hidden && !this.paused) this.animationId = requestAnimationFrame(this.tick);
        });
    }

    update() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.frame.update(this.x, this.y, this.canvas, this.gravity);
        this.updateStatus();
        this.animationId = requestAnimationFrame(this.tick);
    }

    setupControls() {
        document.getElementById("pause-button").addEventListener("click", () => this.setPaused(!this.paused));
        document.getElementById("reset-button").addEventListener("click", () => {
            this.frame = new Frame(this.canvas, this.getPageLinks());
            this.x = 0;
            this.y = 0;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.canvas.classList.remove("link-hover");
            this.updateStatus();
            document.getElementById("announcement").textContent = "Fresh soup. Canvas reset.";
        });
        document.getElementById("feed-button").addEventListener("click", () => {
            const bit = new Bit(this.canvas);
            bit.num = "1";
            bit.position = new Vector(this.canvas.width / 2, 40);
            bit.velocity = new Vector((Math.random() - 0.5) * 5, 1);
            this.frame.addOutsideBit(bit);
            bit.draw();
            this.updateStatus();
            document.getElementById("announcement").textContent = "The soup has been fed. It remains hungry.";
        });
        document.getElementById("siuuu-button").addEventListener("click", () => this.siuuu());
        document.querySelector(".skip-link").addEventListener("click", (event) => {
            event.preventDefault();
            document.getElementById("link-drawer").open = true;
            const summary = document.querySelector(".link-drawer summary");
            summary.focus({ preventScroll: true });
            summary.scrollIntoView({ block: "center" });
        });
    }

    setPaused(paused) {
        this.paused = paused;
        cancelAnimationFrame(this.animationId);
        document.body.classList.toggle("motion-paused", paused);
        const button = document.getElementById("pause-button");
        button.textContent = paused ? "▶" : "Ⅱ";
        button.setAttribute("aria-pressed", String(paused));
        button.setAttribute("aria-label", paused ? "Resume motion" : "Pause motion");
        button.title = paused ? "Resume motion" : "Pause motion";
        document.getElementById("soup-status").textContent = paused
            ? "soup on hold. take your time."
            : "move your mouse / drag your finger";
        if (paused) {
            document.getElementById("slop-effects").replaceChildren();
        } else if (!document.hidden) {
            // Forget pointer acceleration accumulated while the soup was paused.
            this.frame.cursor.movement.positions = Array.from({ length: 3 }, () => new Vector(this.x, this.y));
            this.animationId = requestAnimationFrame(this.tick);
        }
    }

    updateStatus() {
        const count = this.frame.outsideBits.filter((bit) => bit.isLink).length;
        const label = `${count} / ${this.frame.cursor.linkTargets.length} links loose`;
        const counter = document.getElementById("link-count");
        if (counter.textContent !== label) counter.textContent = label;
        this.canvas.parentElement.classList.toggle("has-bits", this.frame.outsideBits.length > 0);
    }

    siuuu() {
        this.siuuus++;
        document.getElementById("siuuu-count").textContent = String(this.siuuus).padStart(3, "0");
        document.getElementById("announcement").textContent = `SIUUU! ${this.siuuus} completely unnecessary celebrations.`;
        this.playSiuuuSound();
        if (this.paused || this.reducedMotion.matches) return;

        const effects = document.getElementById("slop-effects");
        effects.replaceChildren();
        for (let i = 0; i < 7; i++) {
            const particle = document.createElement("span");
            particle.className = "siuuu-particle";
            particle.textContent = i % 3 === 0 ? "SIUUUUU" : "SIUUU";
            particle.style.setProperty("--x", `${5 + Math.random() * 65}%`);
            particle.style.setProperty("--y", `${20 + Math.random() * 65}%`);
            particle.style.setProperty("--rotation", `${Math.random() * 50 - 25}deg`);
            effects.appendChild(particle);
            setTimeout(() => particle.remove(), 1700);
        }
    }

    playSiuuuSound() {
        const roll = Math.random();
        // The two standard clips each get 45%; hehe siu is the rare 10%.
        const file = roll < 0.45 ? "siu.mp3"
            : roll < 0.9 ? "suuuuuuuuuuuuu.mp3"
            : "cr7-hehe-siu.mp3";
        const playbackId = ++this.siuuuPlaybackId;

        // One player keeps repeated presses from layering sounds.
        this.siuuuAudio.pause();
        this.siuuuAudio.src = `audio/${file}`;
        this.siuuuAudio.play().catch((error) => {
            if (playbackId !== this.siuuuPlaybackId || error.name === "AbortError") return;
            document.getElementById("announcement").textContent = "Sound could not play. Try SIUUU again.";
        });
    }

    getCanvasPoint(eventPoint) {
        const rect = this.canvas.getBoundingClientRect();
        return new Vector(eventPoint.clientX - rect.left, eventPoint.clientY - rect.top);
    }

    resizeCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        if (this.frame) {
            this.frame.outsideBits.forEach((bit) => {
                if (bit.isLink) bit.bounceOffBorders(this.canvas);
                bit.draw();
            });
        }
    }

    updateHover(point) {
        this.canvas.classList.toggle("link-hover", Boolean(this.frame.getLinkAt(point.x, point.y)));
    }

    getPageLinks() {
        return Array.from(document.querySelectorAll(".site-links a")).map((link) => ({
            label: link.textContent,
            href: link.getAttribute("href"),
            target: link.getAttribute("target"),
        }));
    }
}

window.addEventListener("DOMContentLoaded", () => {
    new Main();
});
