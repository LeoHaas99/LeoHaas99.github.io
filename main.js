class Main {
    constructor() {
        this.gravity = 0.1;
        this.x = 0;
        this.y = 0;

        this.canvas = document.getElementById('bgCanvas');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        this.frame = new Frame(this.canvas, this.getPageLinks());
        window.addEventListener("mousemove", (e) => {
            const point = this.getCanvasPoint(e);
            this.x = point.x;
            this.y = point.y;
            this.updateHover(point);
        });
        // also for mobile
        window.addEventListener("touchmove", (e) => {
            const point = this.getCanvasPoint(e.touches[0]);
            this.x = point.x;
            this.y = point.y;
        });
        window.addEventListener("click", (e) => {
            if (e.target.closest(".site-links")) {
                return;
            }

            const point = this.getCanvasPoint(e);
            const linkTarget = this.frame.getLinkAt(point.x, point.y);

            if (linkTarget) {
                window.location.href = linkTarget.href;
            }
        });
        window.addEventListener("resize", (e) => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        });
        requestAnimationFrame(this.update.bind(this));
    }

    update() {
        let ctx = this.canvas.getContext("2d");
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.frame.update(this.x, this.y, this.canvas, this.gravity);
        requestAnimationFrame(this.update.bind(this));
    }

    getCanvasPoint(eventPoint) {
        const rect = this.canvas.getBoundingClientRect();
        return new Vector(eventPoint.clientX - rect.left, eventPoint.clientY - rect.top);
    }

    updateHover(point) {
        document.body.classList.toggle("link-hover", Boolean(this.frame.getLinkAt(point.x, point.y)));
    }

    getPageLinks() {
        return Array.from(document.querySelectorAll(".site-links a")).map((link) => ({
            label: link.textContent,
            href: link.getAttribute("href"),
        }));
    }
}

window.onload = () => {
    new Main();
};
