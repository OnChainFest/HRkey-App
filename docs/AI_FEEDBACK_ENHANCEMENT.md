# AI Feedback Enhancement for HRKey Reputation System

## Philosophy Integration

The AI feedback system is designed to support HRKey's core philosophy:

> **"Hidden ≠ erased. The strikethrough must remain visible forever."**

This means AI must:
- **Guide clarity** without censoring
- **Suggest constructive phrasing** while respecting user intent
- **NEVER** hide negative feedback automatically
- **ALWAYS** leave final decisions to the user

---

## Current AI Implementation

### Existing: `backend/controllers/aiRefine.controller.js`

**Purpose:** AI-powered reference refinement using OpenAI GPT-4

**System Prompt Principles (ALIGNED with HRKey Philosophy):**
```
"Do NOT remove or censor content automatically."
"Leave the final decision entirely to the referee."
```

**Input:**
- Experience context (role, company, dates, visibility)
- Referee draft text

**Output:**
```json
{
  "refined": "string",
  "flags": [
    {
      "type": "POTENTIALLY_SENSITIVE_COMPANY_INFO" | "LEGAL_VISIBILITY_RISK" | "LOW_SPECIFICITY",
      "excerpt": "string",
      "suggestion": "string"
    }
  ]
}
```

---

## Enhancement Proposal: Correction & Evolution Guidance

### New Use Cases

#### 1. **Feedback → Correction → Second Feedback Flow**

When a candidate wants to:
1. Hide an existing reference (now shown as strikethrough)
2. Request a corrected/updated reference
3. Demonstrate evolution

**AI Role:**
- Help candidate articulate what changed
- Suggest non-accusatory language for correction request
- Guide referee to focus on improvements without erasing past context

**Example Prompt Template:**
```
You are helping a candidate request an updated reference.

Context:
- Previous reference was hidden by the candidate
- Reason for hiding: {hide_reason}
- Original reference was from {reference_type} at {company}
- Time period: {time_elapsed_since_original}

Draft request to referee:
{candidate_draft}

Your task:
1. Refine the request to be professional and forward-looking
2. Avoid language that sounds defensive or accusatory
3. Emphasize growth and change
4. Suggest concrete examples the referee could focus on

Output JSON:
{
  "refined_request": "string",
  "suggested_focus_areas": ["string"],
  "tone_analysis": "constructive | defensive | neutral"
}
```

#### 2. **Why Hide? — Contextual Guidance**

When a candidate is considering hiding a reference, AI can:
- Explain implications (strikethrough will be visible)
- Suggest if correction is better than hiding
- Provide language for requesting updates

**Prompt Template:**
```
You are helping a candidate decide whether to hide a reference.

Reference summary: {sanitized_summary}
Candidate concern: {user_input_concern}

DO NOT:
- Make the decision for them
- Shame or judge the content
- Suggest erasing history

DO:
- Explain what "hiding with strikethrough" means
- Offer alternative actions (request correction, add context, leave visible)
- Help them articulate their concern clearly

Output JSON:
{
  "explanation_of_hiding": "string",
  "alternatives": ["string"],
  "suggested_next_step": "hide_with_strikethrough | request_correction | do_nothing"
}
```

#### 3. **Referee Guidance — Constructive Framing**

When a referee receives a correction request, AI can:
- Help them understand what changed
- Frame feedback around observable behaviors and outcomes
- Avoid comparative language ("better than before")

**Prompt Template:**
```
You are helping a referee write an updated reference.

Context:
- This is a CORRECTION of a previous reference
- Candidate has requested an update after {time_period}
- Focus areas requested by candidate: {focus_areas}

Previous reference (hidden, shown as strikethrough to public):
[DO NOT SHOW TO REFEREE - ONLY USE FOR AI CONTEXT]
{previous_reference_content}

Referee's new draft:
{referee_new_draft}

Your task:
1. Ensure the new reference is forward-looking
2. Focus on recent observable behaviors and outcomes
3. Avoid phrases like "improvement from before" or "better than last time"
4. Maintain professional, factual tone

Output JSON:
{
  "refined": "string",
  "flags": [...],
  "correction_guidance": "This reference will replace a hidden one. Focus on current performance, not comparison."
}
```

---

## Integration Points

### 1. **Dashboard — Hide Reference Modal**

When user clicks "Hide" button:

```tsx
const handleHide = async (referenceId: string) => {
  // Step 1: Show AI guidance modal
  const aiGuidance = await fetch('/api/ai/guidance/hide', {
    method: 'POST',
    body: JSON.stringify({
      referenceId,
      userConcern: userInputConcern // optional text input
    })
  });

  const { explanation, alternatives, suggestedNextStep } = await aiGuidance.json();

  // Step 2: Show modal with AI suggestions
  showModal({
    title: "Hide this reference?",
    explanation,
    alternatives,
    actions: [
      { label: "Hide with strikethrough", action: () => hideReference(referenceId) },
      { label: "Request correction instead", action: () => requestCorrection(referenceId) },
      { label: "Cancel", action: () => closeModal() }
    ]
  });
};
```

### 2. **Correction Request Flow**

New endpoint: `POST /api/references/:referenceId/request-correction`

```javascript
export async function requestCorrection(req, res) {
  const { referenceId } = req.params;
  const { reason, focusAreas } = req.body;

  // Step 1: AI refines the correction request
  const aiRefinement = await refineCorrect ionRequest({
    referenceId,
    reason,
    focusAreas
  });

  // Step 2: Create correction request record
  const { data, error } = await supabase
    .from('reference_correction_requests')
    .insert({
      original_reference_id: referenceId,
      requested_by: req.user.id,
      reason: aiRefinement.refined_reason,
      focus_areas: aiRefinement.suggested_focus_areas,
      status: 'pending'
    });

  // Step 3: Send notification to referee
  await sendCorrectionRequestEmail({
    refereeEmail,
    candidateName,
    refinedRequest: aiRefinement.refined_request,
    focusAreas: aiRefinement.suggested_focus_areas
  });

  return res.json({ ok: true, correctionRequestId: data.id });
}
```

### 3. **New Table: `reference_correction_requests`**

```sql
CREATE TABLE reference_correction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_reference_id UUID NOT NULL REFERENCES references(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id),
  reason TEXT,
  focus_areas TEXT[],
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'declined')),
  referee_response TEXT,
  new_reference_id UUID REFERENCES references(id), -- if referee provides new one
  created_at TIMESTAMPTZ DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);
```

---

## Prompt Engineering Best Practices

### 1. **Tone Consistency**

All AI interactions must maintain:
- **Neutral, professional tone**
- **Non-judgmental language**
- **Empowerment over paternalism**

### 2. **Transparency**

Always indicate when AI has processed content:
```
✨ AI-refined suggestion (you can edit this before sending)
```

### 3. **Reversibility**

Users can always:
- Edit AI suggestions before submitting
- Ignore AI guidance entirely
- Revert to manual input

### 4. **Privacy**

- Never log full reference content to AI logs
- Only send sanitized summaries for guidance
- Flag sensitive data before AI processing

---

## Testing Scenarios

### Scenario 1: Candidate Hides Negative Reference

**Input:**
- Reference contains criticism about missed deadlines
- Candidate wants to hide it

**Expected AI Behavior:**
1. Explain strikethrough will be visible
2. Suggest requesting updated reference after demonstrating improvement
3. Provide language for correction request focusing on growth

### Scenario 2: Referee Receives Correction Request

**Input:**
- Original reference was critical
- Candidate has improved over 6 months
- Referee wants to provide updated reference

**Expected AI Behavior:**
1. Guide referee to focus on recent performance
2. Avoid comparative language ("better than before")
3. Emphasize observable outcomes and behaviors

### Scenario 3: Candidate Wants to Add Context

**Input:**
- Reference is accurate but lacks context
- Candidate wants to explain circumstances

**Expected AI Behavior:**
1. Suggest adding a self-commentary field (future feature)
2. Explain that hiding doesn't add context
3. Recommend requesting supplementary reference

---

## Metrics & Success Criteria

### AI Quality Metrics

1. **Guidance Acceptance Rate**
   - % of users who follow AI suggestions vs. ignore them
   - Target: >60% acceptance rate

2. **Correction Success Rate**
   - % of correction requests that result in new reference
   - Target: >40% completion rate

3. **Tone Analysis**
   - AI-refined text should score higher on "constructive" metric
   - Manual review of sample outputs

### User Experience Metrics

1. **Time to Decision**
   - Average time from "hide" click to final action
   - Should be < 2 minutes with AI guidance

2. **User Satisfaction**
   - Survey after correction request flow
   - Target: >4/5 stars

3. **Support Ticket Reduction**
   - Fewer questions about "what happens when I hide?"
   - Target: -30% reduction in related support tickets

---

## Implementation Roadmap

### Phase 1: Foundation (Current)
✅ Strikethrough system implemented
✅ Hide/unhide functionality
✅ Basic AI refinement for references

### Phase 2: Correction Flow (Next)
- [ ] Add `reference_correction_requests` table
- [ ] Implement `POST /api/references/:id/request-correction`
- [ ] Create correction request UI
- [ ] Enhance AI prompts for correction guidance

### Phase 3: Advanced Guidance (Future)
- [ ] AI-powered "should I hide?" decision support
- [ ] Contextual help based on reference content analysis
- [ ] Referee training materials (AI-generated)
- [ ] Evolution timeline visualization

---

## Ethical Considerations

### What AI Should NEVER Do

1. **Auto-hide references** based on negativity detection
2. **Remove critical feedback** without explicit user action
3. **Rewrite to change meaning** (only clarity/tone improvements)
4. **Make value judgments** about whether feedback is "deserved"

### What AI Should ALWAYS Do

1. **Disclose its involvement** ("AI-suggested phrasing")
2. **Respect user autonomy** (suggestions, not commands)
3. **Preserve intent** (clarify, don't censor)
4. **Support growth narratives** (focus on evolution, not erasure)

---

## Conclusion

The AI feedback system is designed to support HRKey's philosophy of:
- **Visible evolution** over erasure
- **Accountability** with humanity
- **Growth** demonstrated through improvement

By integrating AI guidance at key decision points, we help users:
- Make informed choices
- Communicate constructively
- Demonstrate professional development

**Remember:** AI is a copilot, not an autopilot. Users drive, AI navigates.
