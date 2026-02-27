class InMemoryQueue {
    constructor(concurrency = 1) {
        this.queue = [];
        this.activeCount = 0;
        this.concurrency = concurrency;
    }

    add(job, priority = 5) {
        this.queue.push({ job, priority });
        this.queue.sort((a, b) => a.priority - b.priority);
        this.next();
    }

    async next() {
        if (this.activeCount >= this.concurrency) return;
        if (!this.queue.length) return;

        const { job } = this.queue.shift();
        this.activeCount++;

        try {
            await job();
        } catch (err) {
            console.error("Broadcast Error:", err.message);
        }

        this.activeCount--;
        this.next();
    }
}

// KVM 2 → keep concurrency 1 for stability
export const notificationQueue = new InMemoryQueue(1);