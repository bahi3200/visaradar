import { useState, useCallback } from "react";
import type { Job } from "@/components/JobCard";
import { sampleJobs } from "@/data/sample";

const STORAGE_KEY = "vr_jobs";

function loadJobs(): Job[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [...sampleJobs];
}

function saveJobs(jobs: Job[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

export function useJobs() {
  const [jobs, setJobs] = useState<Job[]>(loadJobs);

  const addJob = useCallback((job: Omit<Job, "id">) => {
    setJobs((prev) => {
      const newJob = { ...job, id: crypto.randomUUID() };
      const updated = [newJob, ...prev];
      saveJobs(updated);
      return updated;
    });
  }, []);

  const updateJob = useCallback((id: string, data: Partial<Job>) => {
    setJobs((prev) => {
      const updated = prev.map((j) => (j.id === id ? { ...j, ...data } : j));
      saveJobs(updated);
      return updated;
    });
  }, []);

  const deleteJob = useCallback((id: string) => {
    setJobs((prev) => {
      const updated = prev.filter((j) => j.id !== id);
      saveJobs(updated);
      return updated;
    });
  }, []);

  return { jobs, addJob, updateJob, deleteJob };
}
