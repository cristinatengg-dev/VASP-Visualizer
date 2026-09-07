function replyHttp(service, projectId) {
  return async (req, res) => {
    const owner = req.knowledgeOwner,
      role = req.platformRole || "owner",
      id = projectId ? req.params.id : null;
    if (!String(req.get("accept") || "").includes("text/event-stream")) {
      res.json(await service.reply(owner, id, req.body, role));
      return;
    }
    const controller = new AbortController();
    let heartbeat;
    const close = () => {
      if (!res.writableEnded) controller.abort();
    };
    res.on("close", close);
    function send(event) {
      if (res.destroyed || res.writableEnded) return;
      if (!res.headersSent) {
        res
          .status(200)
          .set({
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            Connection: "keep-alive",
          });
        res.flushHeaders();
        heartbeat = setInterval(() => {
          if (!res.destroyed && !res.writableEnded)
            res.write(": heartbeat\n\n");
        }, 10000);
      }
      res.write("data: " + JSON.stringify(event) + "\n\n");
    }
    try {
      const messages = await service.reply(owner, id, req.body, role, {
        signal: controller.signal,
        onEvent: send,
      });
      send({ type: "done", messages });
    } catch (error) {
      if (!res.headersSent && !res.destroyed) throw error;
      // Resolve references again: never return a stale generated answer after permissions changed.
      let messages;
      try {
        messages = id
          ? service.project(owner, id, role).workflow.messages
          : service.conversation(owner, role).messages;
      } catch {
        /* inaccessible */
      }
      send({
        type: "error",
        error: error.status ? error.message : "回复处理失败，请重试",
        status: error.status || 500,
        messages,
      });
    } finally {
      clearInterval(heartbeat);
      res.off("close", close);
      if (res.headersSent && !res.destroyed) res.end();
    }
  };
}
module.exports = { replyHttp };
