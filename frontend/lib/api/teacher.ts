/* ==========  frontend/lib/api/teacher.ts  ===============*/
import type { ApiResponse, PaginationMeta } from "@/lib/api/types";

import { apiClient } from "./client";

export interface TeacherDashboardMetrics {
  exam_overview: {
    total_exams: number;
    draft_exams: number;
    published_exams: number;
    running_exams: number;
    completed_exams: number;
    archived_exams: number;
    upcoming_exams: number;
    live_exams_now: number;
  };
  student_overview: {
    total_assigned_candidates: number;
    unique_assigned_students: number;
    attended_students: number;
    submitted_students: number;
    timeout_students: number;
    absent_students: number;
    attendance_rate: number;
    submission_rate: number;
  };
  attempt_overview: {
    in_progress_attempts: number;
    completed_attempts: number;
    auto_submitted_attempts: number;
  };
  result_overview: {
    published_results: number;
    average_marks: number;
    highest_marks: number;
    lowest_marks: number;
    average_percentage: number;
    pass_count: number;
    fail_count: number;
  };
  review_overview: {
    pending_text_reviews: number;
  };
  recent_exams: Array<{
    _id: string;
    title: string;
    status: string;
    start_time: string;
    end_time: string;
    total_candidates: number;
    updated_at: string;
  }>;
}

export interface TeacherTest {
  _id: string;
  title: string;
  slug: string;
  status: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  total_candidates: number;
  total_slots: number;
  total_question_set: number;
}

export interface CreateTeacherTestPayload {
  title: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  total_candidates?: number;
  total_slots?: number;
  total_question_set?: number;
  question_type_mode?: "radio" | "checkbox" | "text" | "mixed";
}

export async function getTeacherDashboardMetrics() {
  const { data } = await apiClient.get<ApiResponse<TeacherDashboardMetrics>>(
    "/teacher/dashboard/metrics",
  );
  return data;
}

export async function getTeacherTests(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}) {
  const { data } = await apiClient.get<ApiResponse<TeacherTest[]>>(
    "/teacher/tests",
    {
      params,
    },
  );

  return {
    items: data.data,
    meta: data.meta as PaginationMeta | undefined,
  };
}

export async function createTeacherTest(payload: CreateTeacherTestPayload) {
  const { data } = await apiClient.post<ApiResponse<TeacherTest>>(
    "/teacher/tests",
    payload,
  );

  return data.data;
}
