import io
import json
from typing import Any, Dict, Optional
from datetime import datetime


def export_to_markdown(problem: Dict, submission: Optional[Dict] = None, notes: str = "") -> str:
    tags = ", ".join(problem.get("topic_tags", []))
    language = (problem.get("language") or "sql").lower()
    language_label = "Python" if language == "python" else "SQL"
    dialect_label = "Python" if language == "python" else problem.get("dialect", "mysql").upper()
    md = f"""# {problem.get('title', 'Untitled Problem')}

**Difficulty:** {problem.get('difficulty', '').capitalize()}
**Topics:** {tags}
**Track:** {language_label}
**Dialect/Runtime:** {dialect_label}
**Generated:** {datetime.utcnow().strftime('%Y-%m-%d')}

---

## Problem Description

{problem.get('description', '')}

---
"""

    if language == "python":
        if problem.get("starter_code"):
            md += f"""## Starter Code

```python
{problem.get('starter_code', '')}
```

"""
        md += f"""## Example

```json
{json.dumps(problem.get('expected_output', {}), indent=2)}
```
"""
    else:
        md += f"""
## Schema

```sql
{problem.get('schema_sql', '')}
```

## Sample Data

```sql
{problem.get('sample_data_sql', '')}
```

## Expected Output

| {' | '.join(problem.get('expected_output', {}).get('columns', []))} |
| {' | '.join(['---'] * len(problem.get('expected_output', {}).get('columns', [])))} |
"""
        for row in problem.get('expected_output', {}).get('rows', []):
            md += f"| {' | '.join(str(v) for v in row)} |\n"

    if notes:
        md += f"\n---\n\n## My Notes\n\n{notes}\n"

    if submission:
        md += f"""
---

## My Solution

**Status:** {submission.get('status', '').replace('_', ' ').title()}
**Submitted:** {submission.get('submitted_at', '')}

```{language}
{submission.get('submitted_sql', '')}
```
"""

    editorial = problem.get('editorial', [])
    if editorial:
        md += "\n---\n\n## Editorial\n\n"
        for i, approach in enumerate(editorial, 1):
            md += f"### Approach {i}: {approach.get('approach_name', '')}\n\n"
            md += f"{approach.get('explanation', '')}\n\n"
            md += f"**Time Complexity:** {approach.get('time_complexity', 'N/A')}  \n"
            md += f"**Space Complexity:** {approach.get('space_complexity', 'N/A')}\n\n"
            solution = approach.get('solution_python', '') if language == "python" else approach.get('solution_sql', '')
            md += f"```{language}\n{solution}\n```\n\n"

    return md


def export_to_pdf(problem: Dict, submission: Optional[Dict] = None, notes: str = "") -> bytes:
    """Generate PDF using reportlab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Preformatted
    from reportlab.lib.enums import TA_LEFT, TA_CENTER

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter,
                            rightMargin=inch, leftMargin=inch,
                            topMargin=inch, bottomMargin=inch)

    styles = getSampleStyleSheet()
    story = []

    # Title
    title_style = ParagraphStyle('Title', parent=styles['Title'],
                                  fontSize=18, spaceAfter=12, textColor=colors.HexColor('#FFA116'))
    story.append(Paragraph(problem.get('title', 'Untitled'), title_style))

    # Meta info
    tags = ", ".join(problem.get("topic_tags", []))
    language = (problem.get("language") or "sql").lower()
    language_label = "Python" if language == "python" else "SQL"
    dialect_label = "Python" if language == "python" else problem.get("dialect", "mysql").upper()
    meta = f"<b>Difficulty:</b> {problem.get('difficulty','').capitalize()} | <b>Topics:</b> {tags} | <b>Track:</b> {language_label} | <b>Dialect/Runtime:</b> {dialect_label}"
    story.append(Paragraph(meta, styles['Normal']))
    story.append(Spacer(1, 0.2 * inch))

    # Description
    story.append(Paragraph("<b>Problem Description</b>", styles['Heading2']))
    story.append(Paragraph(problem.get('description', '').replace('\n', '<br/>'), styles['Normal']))
    story.append(Spacer(1, 0.2 * inch))

    code_style = ParagraphStyle('Code', parent=styles['Code'], fontSize=8,
                                 backColor=colors.HexColor('#F5F5F5'), leftIndent=10)

    if language == "python":
        if problem.get('starter_code'):
            story.append(Paragraph("<b>Starter Code</b>", styles['Heading2']))
            story.append(Preformatted(problem.get('starter_code', ''), code_style))
            story.append(Spacer(1, 0.2 * inch))
        story.append(Paragraph("<b>Example</b>", styles['Heading2']))
        story.append(Preformatted(json.dumps(problem.get('expected_output', {}), indent=2), code_style))
        story.append(Spacer(1, 0.2 * inch))
    else:
        story.append(Paragraph("<b>Schema</b>", styles['Heading2']))
        story.append(Preformatted(problem.get('schema_sql', ''), code_style))
        story.append(Spacer(1, 0.2 * inch))

        # Expected output table
        exp = problem.get('expected_output', {})
        cols = exp.get('columns', [])
        rows = exp.get('rows', [])
        if cols:
            story.append(Paragraph("<b>Expected Output</b>", styles['Heading2']))
            table_data = [cols] + [[str(v) for v in r] for r in rows[:10]]
            t = Table(table_data, hAlign='LEFT')
            t.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FFA116')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('PADDING', (0, 0), (-1, -1), 4),
            ]))
            story.append(t)
            story.append(Spacer(1, 0.2 * inch))

    # My solution
    if submission:
        story.append(Paragraph("<b>My Solution</b>", styles['Heading2']))
        status_color = '#00B8A3' if submission.get('status') == 'accepted' else '#FF375F'
        story.append(Paragraph(
            f"Status: <font color='{status_color}'>{submission.get('status','').replace('_',' ').title()}</font>",
            styles['Normal']
        ))
        story.append(Preformatted(submission.get('submitted_sql', ''), code_style))
        story.append(Spacer(1, 0.2 * inch))

    # Notes
    if notes:
        story.append(Paragraph("<b>My Notes</b>", styles['Heading2']))
        story.append(Paragraph(notes.replace('\n', '<br/>'), styles['Normal']))
        story.append(Spacer(1, 0.2 * inch))

    # Editorial
    editorial = problem.get('editorial', [])
    if editorial:
        story.append(Paragraph("<b>Editorial</b>", styles['Heading2']))
        for i, approach in enumerate(editorial, 1):
            story.append(Paragraph(f"Approach {i}: {approach.get('approach_name','')}", styles['Heading3']))
            story.append(Paragraph(approach.get('explanation', ''), styles['Normal']))
            story.append(Paragraph(
                f"<b>Time:</b> {approach.get('time_complexity','N/A')} | <b>Space:</b> {approach.get('space_complexity','N/A')}",
                styles['Normal']
            ))
            solution = approach.get('solution_python', '') if language == "python" else approach.get('solution_sql', '')
            story.append(Preformatted(solution, code_style))
            story.append(Spacer(1, 0.15 * inch))

    doc.build(story)
    return buffer.getvalue()
