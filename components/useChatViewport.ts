"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentMessage } from "@/lib/types";
import {
  captureScrollDistance,
  getNextVisibleCount,
  restoreScrollTop,
  VISIBLE_PAGE_SIZE,
} from "@/lib/chat-lazy-load";
import { getCompletionScrollAllowed, isAtScrollTail } from "./chat-viewport-state";

const PROGRAMMATIC_SCROLL_IGNORE_MS = 700;
const USER_SCROLL_INTENT_MS = 1200;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Space", "Spacebar"]);

type UseChatViewportOptions = {
  messageCount: number;
  streamingMessage: Partial<AgentMessage> | null;
  agentRunning: boolean;
  loading: boolean;
  promptGeneration: number;
};

export function useChatViewport({
  messageCount,
  streamingMessage,
  agentRunning,
  loading,
  promptGeneration,
}: UseChatViewportOptions) {
  const [visibleCount, setVisibleCount] = useState(VISIBLE_PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const prevScrollDistanceRef = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastUserMessageRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);
  const completionScrollAllowedRef = useRef(true);
  const userScrollIntentUntilRef = useRef(0);
  const ignoreProgrammaticScrollUntilRef = useRef(0);
  const handledPromptGenerationRef = useRef(promptGeneration);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    ignoreProgrammaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_IGNORE_MS;
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const scrollUserMessageToTop = useCallback(() => {
    const container = scrollContainerRef.current;
    const message = lastUserMessageRef.current;
    if (!container || !message) return;
    const top = message.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
    ignoreProgrammaticScrollUntilRef.current = Date.now() + PROGRAMMATIC_SCROLL_IGNORE_MS;
    container.scrollTo({ top: top - 16, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      prevScrollDistanceRef.current = captureScrollDistance(container.scrollHeight, container.scrollTop);
      setVisibleCount((current) => getNextVisibleCount(current));
    }, { root: container, threshold: 0 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [messageCount, visibleCount]);

  useEffect(() => {
    if (prevScrollDistanceRef.current === null) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTop = restoreScrollTop(container.scrollHeight, prevScrollDistanceRef.current);
    prevScrollDistanceRef.current = null;
  }, [visibleCount]);

  const markUserScrollIntent = useCallback((event: Event) => {
    if (event instanceof KeyboardEvent) {
      if (!SCROLL_KEYS.has(event.key)) return;
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable='true']")) return;
    }
    userScrollIntentUntilRef.current = Date.now() + USER_SCROLL_INTENT_MS;
  }, []);

  const handleScrollPositionChange = useCallback((event: Event) => {
    if (!agentRunning) return;
    const container = event.currentTarget as HTMLDivElement;
    completionScrollAllowedRef.current = getCompletionScrollAllowed({
      current: completionScrollAllowedRef.current,
      atTail: isAtScrollTail(container.scrollHeight, container.scrollTop, container.clientHeight),
      now: Date.now(),
      ignoreProgrammaticScrollUntil: ignoreProgrammaticScrollUntilRef.current,
      userScrollIntentUntil: userScrollIntentUntilRef.current,
    });
  }, [agentRunning]);

  useEffect(() => {
    window.addEventListener("keydown", markUserScrollIntent);
    window.addEventListener("pointerdown", markUserScrollIntent, { passive: true });
    return () => {
      window.removeEventListener("keydown", markUserScrollIntent);
      window.removeEventListener("pointerdown", markUserScrollIntent);
    };
  }, [markUserScrollIntent]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener("wheel", markUserScrollIntent, { passive: true });
    container.addEventListener("touchstart", markUserScrollIntent, { passive: true });
    container.addEventListener("scroll", handleScrollPositionChange, { passive: true });
    return () => {
      container.removeEventListener("wheel", markUserScrollIntent);
      container.removeEventListener("touchstart", markUserScrollIntent);
      container.removeEventListener("scroll", handleScrollPositionChange);
    };
  }, [messageCount, loading, handleScrollPositionChange, markUserScrollIntent]);

  useEffect(() => {
    if (promptGeneration === handledPromptGenerationRef.current) return;
    handledPromptGenerationRef.current = promptGeneration;
    completionScrollAllowedRef.current = true;
    initialScrollDoneRef.current = true;
    scrollUserMessageToTop();
  }, [promptGeneration, scrollUserMessageToTop]);

  useEffect(() => {
    if (messageCount === 0) return;
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      scrollToBottom("instant");
    } else if (!agentRunning && completionScrollAllowedRef.current) {
      scrollToBottom("smooth");
    }
  }, [messageCount, agentRunning, scrollToBottom]);

  useEffect(() => {
    if (streamingMessage && completionScrollAllowedRef.current) {
      scrollToBottom("instant");
    }
  }, [streamingMessage, scrollToBottom]);

  return {
    visibleCount,
    sentinelRef,
    scrollContainerRef,
    messagesEndRef,
    lastUserMessageRef,
  };
}
