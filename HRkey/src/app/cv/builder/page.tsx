"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Experience = {
  id?: string;
  role: string;
  company: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  description: string;
  location: string;
  employment_type: string;
};

type Skill = {
  id?: string;
  skill_name: string;
  category: string;
  proficiency_level: string;
  years_of_experience: number | null;
};

type Education = {
  id?: string;
  institution: string;
  degree: string;
  field_of_study: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  grade: string;
};

export default function CVBuilderPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  // Profile data
  const [fullName, setFullName] = useState("");
  const [headline, setHeadline] = useState("");
  const [publicHandle, setPublicHandle] = useState("");

  // Experiences
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [showExpForm, setShowExpForm] = useState(false);
  const [newExp, setNewExp] = useState<Experience>({
    role: "",
    company: "",
    start_date: "",
    end_date: null,
    is_current: false,
    description: "",
    location: "",
    employment_type: "full-time"
  });

  // Skills
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [newSkill, setNewSkill] = useState<Skill>({
    skill_name: "",
    category: "Technical",
    proficiency_level: "intermediate",
    years_of_experience: null
  });

  // Education
  const [education, setEducation] = useState<Education[]>([]);
  const [showEduForm, setShowEduForm] = useState(false);
  const [newEdu, setNewEdu] = useState<Education>({
    institution: "",
    degree: "",
    field_of_study: "",
    start_date: "",
    end_date: null,
    is_current: false,
    grade: ""
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/test");
      return;
    }

    setUserId(user.id);

    // Load basic profile
    const { data: profile } = await supabase
      .from("users")
      .select("full_name, headline, public_handle")
      .eq("id", user.id)
      .single();

    if (profile) {
      setFullName(profile.full_name || "");
      setHeadline(profile.headline || "");
      setPublicHandle(profile.public_handle || "");
    }

    // Load experiences
    const { data: expData } = await supabase
      .from("candidate_experiences")
      .select("*")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false });

    if (expData) setExperiences(expData);

    // Load skills
    const { data: skillData } = await supabase
      .from("candidate_skills")
      .select("*")
      .eq("user_id", user.id)
      .order("display_order");

    if (skillData) setSkills(skillData);

    // Load education
    const { data: eduData } = await supabase
      .from("candidate_education")
      .select("*")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false });

    if (eduData) setEducation(eduData);

    setLoading(false);
  };

  const saveBasicProfile = async () => {
    setMsg("Saving profile...");
    const { error } = await supabase
      .from("users")
      .update({
        full_name: fullName,
        headline,
        public_handle: publicHandle
      })
      .eq("id", userId);

    if (error) return setMsg(`Error: ${error.message}`);
    setMsg("Profile saved successfully!");
  };

  const addExperience = async () => {
    setMsg("Adding experience...");
    const { error } = await supabase
      .from("candidate_experiences")
      .insert([{ ...newExp, user_id: userId }]);

    if (error) return setMsg(`Error: ${error.message}`);

    setMsg("Experience added!");
    setShowExpForm(false);
    setNewExp({
      role: "",
      company: "",
      start_date: "",
      end_date: null,
      is_current: false,
      description: "",
      location: "",
      employment_type: "full-time"
    });
    await loadProfile();
  };

  const addSkill = async () => {
    setMsg("Adding skill...");
    const { error } = await supabase
      .from("candidate_skills")
      .insert([{ ...newSkill, user_id: userId }]);

    if (error) return setMsg(`Error: ${error.message}`);

    setMsg("Skill added!");
    setShowSkillForm(false);
    setNewSkill({
      skill_name: "",
      category: "Technical",
      proficiency_level: "intermediate",
      years_of_experience: null
    });
    await loadProfile();
  };

  const addEducation = async () => {
    setMsg("Adding education...");
    const { error } = await supabase
      .from("candidate_education")
      .insert([{ ...newEdu, user_id: userId }]);

    if (error) return setMsg(`Error: ${error.message}`);

    setMsg("Education added!");
    setShowEduForm(false);
    setNewEdu({
      institution: "",
      degree: "",
      field_of_study: "",
      start_date: "",
      end_date: null,
      is_current: false,
      grade: ""
    });
    await loadProfile();
  };

  const deleteExperience = async (id: string) => {
    if (!confirm("Delete this experience?")) return;
    const { error } = await supabase
      .from("candidate_experiences")
      .delete()
      .eq("id", id);

    if (error) return setMsg(`Error: ${error.message}`);
    setMsg("Experience deleted");
    await loadProfile();
  };

  const deleteSkill = async (id: string) => {
    if (!confirm("Delete this skill?")) return;
    const { error } = await supabase
      .from("candidate_skills")
      .delete()
      .eq("id", id);

    if (error) return setMsg(`Error: ${error.message}`);
    setMsg("Skill deleted");
    await loadProfile();
  };

  const deleteEducation = async (id: string) => {
    if (!confirm("Delete this education entry?")) return;
    const { error } = await supabase
      .from("candidate_education")
      .delete()
      .eq("id", id);

    if (error) return setMsg(`Error: ${error.message}`);
    setMsg("Education deleted");
    await loadProfile();
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <p>Loading your CV...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">CV Builder</h1>
          <p className="text-slate-600 mt-1">
            Build your professional profile for HRKey
          </p>
        </div>
        <button
          onClick={() => router.push("/dashboard")}
          className="px-4 py-2 rounded-lg border shadow-sm bg-white hover:bg-slate-50"
        >
          Back to Dashboard
        </button>
      </header>

      {msg && (
        <div className="p-4 rounded-lg border bg-blue-50 text-blue-900">
          {msg}
        </div>
      )}

      {/* Basic Profile */}
      <section className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Basic Information</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Professional Headline
            </label>
            <input
              type="text"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="Senior Software Engineer | Full-Stack Developer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Public Handle
            </label>
            <input
              type="text"
              value={publicHandle}
              onChange={(e) => setPublicHandle(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="john_doe"
            />
          </div>
          <button
            onClick={saveBasicProfile}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Save Basic Info
          </button>
        </div>
      </section>

      {/* Work Experience */}
      <section className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Work Experience</h2>
          <button
            onClick={() => setShowExpForm(!showExpForm)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
          >
            {showExpForm ? "Cancel" : "+ Add Experience"}
          </button>
        </div>

        {showExpForm && (
          <div className="p-4 rounded-lg border bg-slate-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <input
                  type="text"
                  value={newExp.role}
                  onChange={(e) => setNewExp({ ...newExp, role: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Software Engineer"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Company</label>
                <input
                  type="text"
                  value={newExp.company}
                  onChange={(e) => setNewExp({ ...newExp, company: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="TechCorp Inc."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <input
                  type="date"
                  value={newExp.start_date}
                  onChange={(e) => setNewExp({ ...newExp, start_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input
                  type="date"
                  value={newExp.end_date || ""}
                  onChange={(e) => setNewExp({ ...newExp, end_date: e.target.value || null })}
                  disabled={newExp.is_current}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <label className="flex items-center mt-1 text-sm">
                  <input
                    type="checkbox"
                    checked={newExp.is_current}
                    onChange={(e) => setNewExp({ ...newExp, is_current: e.target.checked, end_date: null })}
                    className="mr-2"
                  />
                  Current position
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Location</label>
                <input
                  type="text"
                  value={newExp.location}
                  onChange={(e) => setNewExp({ ...newExp, location: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="San Francisco, CA"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Employment Type</label>
                <select
                  value={newExp.employment_type}
                  onChange={(e) => setNewExp({ ...newExp, employment_type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="full-time">Full-time</option>
                  <option value="part-time">Part-time</option>
                  <option value="contract">Contract</option>
                  <option value="freelance">Freelance</option>
                  <option value="internship">Internship</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                value={newExp.description}
                onChange={(e) => setNewExp({ ...newExp, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                rows={4}
                placeholder="Key responsibilities and achievements..."
              />
            </div>
            <button
              onClick={addExperience}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Add Experience
            </button>
          </div>
        )}

        <div className="space-y-3">
          {experiences.length === 0 && <p className="text-slate-600 text-sm">No experience added yet.</p>}
          {experiences.map((exp) => (
            <div key={exp.id} className="p-4 rounded-lg border bg-slate-50">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{exp.role}</h3>
                  <p className="text-sm text-slate-700">{exp.company}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {exp.start_date} — {exp.is_current ? "Present" : exp.end_date || "N/A"}
                    {exp.location && ` • ${exp.location}`}
                  </p>
                  {exp.description && (
                    <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{exp.description}</p>
                  )}
                </div>
                <button
                  onClick={() => deleteExperience(exp.id!)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Skills */}
      <section className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Skills</h2>
          <button
            onClick={() => setShowSkillForm(!showSkillForm)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
          >
            {showSkillForm ? "Cancel" : "+ Add Skill"}
          </button>
        </div>

        {showSkillForm && (
          <div className="p-4 rounded-lg border bg-slate-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Skill Name</label>
                <input
                  type="text"
                  value={newSkill.skill_name}
                  onChange={(e) => setNewSkill({ ...newSkill, skill_name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="React, Python, Communication..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  value={newSkill.category}
                  onChange={(e) => setNewSkill({ ...newSkill, category: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="Technical">Technical</option>
                  <option value="Soft Skills">Soft Skills</option>
                  <option value="Languages">Languages</option>
                  <option value="Tools">Tools</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Proficiency</label>
                <select
                  value={newSkill.proficiency_level}
                  onChange={(e) => setNewSkill({ ...newSkill, proficiency_level: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="expert">Expert</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Years of Experience</label>
                <input
                  type="number"
                  value={newSkill.years_of_experience || ""}
                  onChange={(e) => setNewSkill({ ...newSkill, years_of_experience: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="5"
                />
              </div>
            </div>
            <button
              onClick={addSkill}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Add Skill
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {skills.length === 0 && <p className="text-slate-600 text-sm">No skills added yet.</p>}
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-sm"
            >
              <span className="font-medium text-indigo-900">{skill.skill_name}</span>
              <span className="text-xs text-indigo-700">({skill.proficiency_level})</span>
              <button
                onClick={() => deleteSkill(skill.id!)}
                className="text-red-600 hover:text-red-800 ml-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Education */}
      <section className="rounded-xl border bg-white shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-900">Education</h2>
          <button
            onClick={() => setShowEduForm(!showEduForm)}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm"
          >
            {showEduForm ? "Cancel" : "+ Add Education"}
          </button>
        </div>

        {showEduForm && (
          <div className="p-4 rounded-lg border bg-slate-50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Institution</label>
                <input
                  type="text"
                  value={newEdu.institution}
                  onChange={(e) => setNewEdu({ ...newEdu, institution: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="MIT"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Degree</label>
                <input
                  type="text"
                  value={newEdu.degree}
                  onChange={(e) => setNewEdu({ ...newEdu, degree: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Bachelor of Science"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Field of Study</label>
                <input
                  type="text"
                  value={newEdu.field_of_study}
                  onChange={(e) => setNewEdu({ ...newEdu, field_of_study: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Computer Science"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <input
                  type="date"
                  value={newEdu.start_date}
                  onChange={(e) => setNewEdu({ ...newEdu, start_date: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input
                  type="date"
                  value={newEdu.end_date || ""}
                  onChange={(e) => setNewEdu({ ...newEdu, end_date: e.target.value || null })}
                  disabled={newEdu.is_current}
                  className="w-full px-3 py-2 border rounded-lg"
                />
                <label className="flex items-center mt-1 text-sm">
                  <input
                    type="checkbox"
                    checked={newEdu.is_current}
                    onChange={(e) => setNewEdu({ ...newEdu, is_current: e.target.checked, end_date: null })}
                    className="mr-2"
                  />
                  Currently studying
                </label>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Grade / GPA</label>
                <input
                  type="text"
                  value={newEdu.grade}
                  onChange={(e) => setNewEdu({ ...newEdu, grade: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="3.8 GPA, Honors, etc."
                />
              </div>
            </div>
            <button
              onClick={addEducation}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Add Education
            </button>
          </div>
        )}

        <div className="space-y-3">
          {education.length === 0 && <p className="text-slate-600 text-sm">No education added yet.</p>}
          {education.map((edu) => (
            <div key={edu.id} className="p-4 rounded-lg border bg-slate-50">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">{edu.degree}</h3>
                  <p className="text-sm text-slate-700">{edu.institution}</p>
                  {edu.field_of_study && (
                    <p className="text-xs text-slate-600 mt-1">{edu.field_of_study}</p>
                  )}
                  <p className="text-xs text-slate-600 mt-1">
                    {edu.start_date} — {edu.is_current ? "Present" : edu.end_date || "N/A"}
                  </p>
                  {edu.grade && (
                    <p className="text-xs text-slate-600 mt-1">Grade: {edu.grade}</p>
                  )}
                </div>
                <button
                  onClick={() => deleteEducation(edu.id!)}
                  className="text-red-600 hover:text-red-800 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
