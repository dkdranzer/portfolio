// All site copy lives here. Edit this file to update the portfolio.

export const profile = {
  name: "Dinesh Kumar G",
  firstName: "Dinesh",
  role: "Software Engineer",
  tagline: "I build multi-agent AI systems for healthcare.",
  location: "Bangalore, India",
  email: "dineshkumartech3@gmail.com",
  linkedin: "https://linkedin.com/in/dinesh-kumar-g-5741132a4",
  github: "https://github.com/dkdranzer",
  resumeUrl: "/Dinesh_Kumar_Resume.pdf",

  // Optional: drop a cinematic ride clip (e.g. made with Higgsfield / Kling)
  // into /public and set its path here, e.g. "/ride.mp4". When set, the site
  // scrubs that video on scroll instead of rendering the live 3D city.
  rideVideo: "" as string,

  summary:
    "Software Engineer at HealthFoundry.ai building event-driven, multi-agent AI systems for healthcare. I ship distributed backend services in Python and TypeScript — LangGraph orchestration, Pub/Sub messaging, real-time delivery and human-in-the-loop routing — on GCP and AWS, and I own the notification, observability and platform SDK layers used across the company's products.",

  stats: [
    { value: "8", label: "services on my observability stack" },
    { value: "2", label: "roles at HealthFoundry.ai" },
    { value: "8.94", label: "CGPA · BMS College of Engineering" },
  ],

  experience: [
    {
      company: "HealthFoundry.ai (SynapseNet)",
      role: "Software Engineer",
      period: "Jul 2026 — Present",
      points: [
        "Designed a LangGraph orchestrator that takes work over REST and Pub/Sub and runs declarative workflows stored in Firestore — resolving steps per request type, dispatching to the right agent and routing results downstream.",
        "Built document- and speech-intelligence agents on Gemini 3.7 Flash — leads, tickets and follow-ups from call recordings; clinical insights from discharge summaries; medications and conditions from prescriptions.",
        "Closed the loop from agent to CRM: extracted entities are written back and a notification ships with a deep link to the new lead.",
        "Own the observability stack (OpenTelemetry, Tempo, Loki, Prometheus, Grafana, MLflow) across 8 FastAPI and Fastify services, on AWS EC2 with GitHub Actions CI/CD.",
        "Authored the shared Platform SDK — auth, profile, permission and domain lookups behind one interface, cutting integration to a few lines.",
      ],
    },
    {
      company: "HealthFoundry.ai (SynapseNet)",
      role: "Data Engineer Intern",
      period: "Sep 2025 — Jun 2026",
      points: [
        "Built the Human Interaction Layer — an event-driven service consuming CloudEvents from Pub/Sub, resolving recipients against Firestore rules and pushing real-time notifications over SSE.",
        "Built the clinical document ingestion pipeline — LangGraph, PHI/PII de-identification with Gemini, Medplum FHIR mapping and SNOMED CT coding via HL7 terminology servers.",
        "Developed the Chrome extension assistant with one-click actions: form filling, opening linked records, authorizing or dismissing notifications.",
        "Managed Firebase hosting, Firestore and Cloud SQL schemas and GCS bucket operations.",
      ],
    },
  ],

  skills: [
    { group: "Languages", items: ["Python", "TypeScript", "SQL", "C++"] },
    {
      group: "AI / LLM",
      items: ["LangGraph", "LangChain", "CrewAI", "LangSmith", "MLflow", "MCP", "RAG", "Hugging Face", "PyTorch", "TensorFlow", "Gemini", "Groq"],
    },
    {
      group: "Architecture",
      items: ["Event-driven", "Microservices", "Pub/Sub", "CloudEvents", "SSE", "Human-in-the-loop", "Multi-agent orchestration", "SDK design"],
    },
    { group: "Backend & Frontend", items: ["FastAPI", "Fastify", "Node.js", "Express", "React", "REST"] },
    {
      group: "Cloud & Ops",
      items: ["GCP", "Firebase", "Firestore", "Cloud SQL", "AWS EC2", "Docker", "Kubernetes", "GitHub Actions"],
    },
    { group: "Observability", items: ["OpenTelemetry", "Grafana", "Tempo", "Loki", "Prometheus"] },
    { group: "Data", items: ["MongoDB", "MySQL", "ChromaDB", "FAISS"] },
    { group: "Healthcare", items: ["FHIR (Medplum)", "HL7", "SNOMED CT", "PHI/PII de-identification"] },
  ],

  projects: [
    {
      title: "Workflow Orchestrator",
      kind: "HealthFoundry · production",
      blurb: "LangGraph engine executing declarative, Firestore-stored workflows over REST and Pub/Sub, dispatching each step to the right AI agent.",
      tags: ["LangGraph", "Pub/Sub", "Firestore"],
    },
    {
      title: "Human Interaction Layer",
      kind: "HealthFoundry · production",
      blurb: "Real-time routing service: CloudEvents in, permission-aware notifications out over Server-Sent Events.",
      tags: ["CloudEvents", "SSE", "HITL"],
    },
    {
      title: "Clinical Document Pipeline",
      kind: "HealthFoundry · production",
      blurb: "Discharge summaries to FHIR resources — classification, de-identification and SNOMED CT coding.",
      tags: ["Gemini", "FHIR", "SNOMED CT"],
    },
    {
      title: "LangGraph AI Chatbot",
      kind: "Personal · Aug–Sep 2025",
      blurb: "Stateful multi-threaded chatbot with persistent memory, Groq LLM tools (web search, stocks, math), streaming and SQLite checkpointing.",
      tags: ["LangGraph", "LangSmith", "Streamlit"],
    },
    {
      title: "YouTube Transcript Q&A RAG",
      kind: "Personal · May–Jun 2025",
      blurb: "RAG over video transcripts — FastAPI ingestion, Cohere embeddings, FAISS, ChatGroq. Dockerized on AWS EC2.",
      tags: ["RAG", "FAISS", "Docker"],
    },
  ],

  education: {
    degree: "B.E. Computer Science & Engineering",
    school: "BMS College of Engineering, Bangalore",
    period: "2022 — 2026",
    score: "CGPA 8.94",
  },

  certifications: [
    "Python for Data Science — NPTEL",
    "Machine Learning Professional — RapidMiner",
  ],
};

// Section order drives both the page and the ride. `stop` is where along the
// route (0 → 1) the rider is when that section is centred on screen.
export const sections = [
  { id: "home", label: "Start", stop: 0 },
  { id: "about", label: "About", stop: 0.15 },
  { id: "experience", label: "Experience", stop: 0.32 },
  { id: "skills", label: "Skills", stop: 0.49 },
  { id: "projects", label: "Projects", stop: 0.66 },
  { id: "education", label: "Education", stop: 0.83 },
  { id: "contact", label: "Contact", stop: 1 },
] as const;
