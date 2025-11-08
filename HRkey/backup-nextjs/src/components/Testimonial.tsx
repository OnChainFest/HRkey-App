export default function Testimonial() {
  return (
    <div className="rounded-2xl border p-6 flex items-center gap-4">
      <img
        src="https://i.pravatar.cc/80?img=5"
        alt="user"
        className="h-12 w-12 rounded-full object-cover"
      />
      <blockquote className="text-slate-700">
        “HRKey makes it easy to manage and share my references with confidence.”
      </blockquote>
    </div>
  );
}
