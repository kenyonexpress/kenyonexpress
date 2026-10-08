import type { TeamMember } from '@/content/about'

/**
 * The team (STEP 53). A list, not a grid of portraits: there is no photo in
 * the repo and a placeholder avatar on an about page reads as a missing
 * person. One `<li>` per entry, so a second member is a second row in
 * `content/about` and nothing here changes.
 */
export default function AboutTeam({ members }: { members: readonly TeamMember[] }) {
  return (
    <section aria-labelledby="about-team">
      <h2 id="about-team" className="text-xl font-semibold text-heading">
        הצוות
      </h2>
      <ul className="mt-3 space-y-4">
        {members.map((member) => (
          <li
            key={member.name}
            data-testid="team-member"
            className="rounded-xl border border-heading/10 bg-white p-5"
          >
            <p className="text-lg font-bold text-heading">{member.name}</p>
            <p className="text-sm text-heading/75">{member.role}</p>
            <p className="mt-2 text-base leading-relaxed text-heading/80">{member.about}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
