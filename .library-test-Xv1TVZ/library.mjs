export const templateLibrary = [
    {
        "id": "education",
        "name": "Education",
        "description": "Enrollment and education support",
        "version": 1,
        "questions": [
            {
                "id": "q_education_0",
                "label": "Student name",
                "type": "text",
                "required": false
            },
            {
                "id": "q_education_1",
                "label": "Currently enrolled",
                "type": "yesno",
                "required": false
            },
            {
                "id": "q_education_2",
                "label": "School / institution",
                "type": "text",
                "required": false
            },
            {
                "id": "q_education_3",
                "label": "Current class",
                "type": "text",
                "required": false
            },
            {
                "id": "q_education_4",
                "label": "Attendance barriers",
                "type": "multiple",
                "required": false,
                "options": [
                    "Fees",
                    "Transport",
                    "Books",
                    "Disability access",
                    "Other"
                ]
            },
            {
                "id": "q_education_5",
                "label": "Education support needed",
                "type": "text",
                "required": false
            }
        ]
    },
    {
        "id": "orphans",
        "name": "Orphans",
        "description": "Guardian and child support needs",
        "version": 1,
        "questions": [
            {
                "id": "q_orphans_0",
                "label": "Child name",
                "type": "text",
                "required": false
            },
            {
                "id": "q_orphans_1",
                "label": "Date of birth (if known)",
                "type": "date",
                "required": false
            },
            {
                "id": "q_orphans_2",
                "label": "Guardian name",
                "type": "text",
                "required": false
            },
            {
                "id": "q_orphans_3",
                "label": "Relationship to child",
                "type": "text",
                "required": false
            },
            {
                "id": "q_orphans_4",
                "label": "Reported parental situation",
                "type": "choice",
                "required": false,
                "options": [
                    "Both parents deceased",
                    "Father deceased",
                    "Mother deceased",
                    "Unknown"
                ]
            },
            {
                "id": "q_orphans_5",
                "label": "Care and support needs",
                "type": "text",
                "required": false
            }
        ]
    },
    {
        "id": "health",
        "name": "Health",
        "description": "Reported needs and access; not a diagnosis",
        "version": 1,
        "questions": [
            {
                "id": "q_health_0",
                "label": "Person name",
                "type": "text",
                "required": false
            },
            {
                "id": "q_health_1",
                "label": "Reported health concern",
                "type": "text",
                "required": false
            },
            {
                "id": "q_health_2",
                "label": "Currently receiving care",
                "type": "yesno",
                "required": false
            },
            {
                "id": "q_health_3",
                "label": "Barriers to care",
                "type": "multiple",
                "required": false,
                "options": [
                    "Cost",
                    "Distance",
                    "Transport",
                    "Availability",
                    "Other"
                ]
            },
            {
                "id": "q_health_4",
                "label": "Requested support",
                "type": "text",
                "required": false
            }
        ]
    },
    {
        "id": "disability",
        "name": "Disability",
        "description": "Functional difficulties and accessibility",
        "version": 1,
        "questions": [
            {
                "id": "q_disability_0",
                "label": "Person name",
                "type": "text",
                "required": false
            },
            {
                "id": "q_disability_1",
                "label": "Reported functional difficulties",
                "type": "multiple",
                "required": false,
                "options": [
                    "Seeing",
                    "Hearing",
                    "Walking",
                    "Communication",
                    "Self-care",
                    "Remembering",
                    "Other"
                ]
            },
            {
                "id": "q_disability_2",
                "label": "Assistive device currently used",
                "type": "text",
                "required": false
            },
            {
                "id": "q_disability_3",
                "label": "Accessibility barriers",
                "type": "text",
                "required": false
            },
            {
                "id": "q_disability_4",
                "label": "Support requested",
                "type": "text",
                "required": false
            }
        ]
    },
    {
        "id": "food",
        "name": "Food / Ration",
        "description": "Food access and household needs",
        "version": 1,
        "questions": [
            {
                "id": "q_food_0",
                "label": "Household contact name",
                "type": "text",
                "required": false
            },
            {
                "id": "q_food_1",
                "label": "Household size",
                "type": "number",
                "required": false,
                "min": 0
            },
            {
                "id": "q_food_2",
                "label": "Food access during the past seven days",
                "type": "choice",
                "required": false,
                "options": [
                    "Sufficient",
                    "Sometimes insufficient",
                    "Frequently insufficient"
                ]
            },
            {
                "id": "q_food_3",
                "label": "Current food support sources",
                "type": "text",
                "required": false
            },
            {
                "id": "q_food_4",
                "label": "Dietary needs",
                "type": "text",
                "required": false
            },
            {
                "id": "q_food_5",
                "label": "Requested food support",
                "type": "text",
                "required": false
            }
        ]
    },
    {
        "id": "livelihood",
        "name": "Livelihood",
        "description": "Employment and livelihood support",
        "version": 1,
        "questions": [
            {
                "id": "q_livelihood_0",
                "label": "Person name",
                "type": "text",
                "required": false
            },
            {
                "id": "q_livelihood_1",
                "label": "Current work situation",
                "type": "choice",
                "required": false,
                "options": [
                    "Employed",
                    "Self-employed",
                    "Seeking work",
                    "Unable to work",
                    "Other"
                ]
            },
            {
                "id": "q_livelihood_2",
                "label": "Skills and experience",
                "type": "text",
                "required": false
            },
            {
                "id": "q_livelihood_3",
                "label": "Income sources",
                "type": "text",
                "required": false
            },
            {
                "id": "q_livelihood_4",
                "label": "Barriers to earning",
                "type": "text",
                "required": false
            },
            {
                "id": "q_livelihood_5",
                "label": "Livelihood support requested",
                "type": "text",
                "required": false
            }
        ]
    },
    {
        "id": "vulnerability",
        "name": "Household Vulnerability",
        "description": "Housing, shocks and basic services",
        "version": 1,
        "questions": [
            {
                "id": "q_vulnerability_0",
                "label": "Household contact name",
                "type": "text",
                "required": false
            },
            {
                "id": "q_vulnerability_1",
                "label": "Household size",
                "type": "number",
                "required": false,
                "min": 0
            },
            {
                "id": "q_vulnerability_2",
                "label": "Housing situation",
                "type": "choice",
                "required": false,
                "options": [
                    "Owned",
                    "Rented",
                    "Temporary shelter",
                    "No stable shelter",
                    "Other"
                ]
            },
            {
                "id": "q_vulnerability_3",
                "label": "Recent shocks or displacement",
                "type": "text",
                "required": false
            },
            {
                "id": "q_vulnerability_4",
                "label": "Basic services lacking",
                "type": "multiple",
                "required": false,
                "options": [
                    "Water",
                    "Sanitation",
                    "Electricity",
                    "Health access",
                    "Education access",
                    "Other"
                ]
            },
            {
                "id": "q_vulnerability_5",
                "label": "Priority household needs",
                "type": "text",
                "required": false
            }
        ]
    },
    {
        "id": "registration",
        "name": "Beneficiary Registration",
        "description": "Minimum identity and household information",
        "version": 1,
        "questions": [
            {
                "id": "q_registration_0",
                "label": "Person full name",
                "type": "text",
                "required": false
            },
            {
                "id": "q_registration_1",
                "label": "Date of birth (if known)",
                "type": "date",
                "required": false
            },
            {
                "id": "q_registration_2",
                "label": "Contact phone (if available)",
                "type": "phone",
                "required": false
            },
            {
                "id": "q_registration_3",
                "label": "Guardian / representative name (if applicable)",
                "type": "text",
                "required": false
            },
            {
                "id": "q_registration_4",
                "label": "Household members",
                "type": "household",
                "required": false
            },
            {
                "id": "q_registration_5",
                "label": "Contact address / location description",
                "type": "text",
                "required": false
            }
        ]
    },
    {
        "id": "followup",
        "name": "Follow-up",
        "description": "Changes since the previous assessment",
        "version": 1,
        "questions": [
            {
                "id": "q_followup_0",
                "label": "Previous case / survey reference",
                "type": "text",
                "required": false
            },
            {
                "id": "q_followup_1",
                "label": "Follow-up date",
                "type": "date",
                "required": false
            },
            {
                "id": "q_followup_2",
                "label": "Changes since previous assessment",
                "type": "text",
                "required": false
            },
            {
                "id": "q_followup_3",
                "label": "Support accessed since assessment",
                "type": "text",
                "required": false
            },
            {
                "id": "q_followup_4",
                "label": "Remaining needs",
                "type": "text",
                "required": false
            },
            {
                "id": "q_followup_5",
                "label": "Next follow-up actions",
                "type": "text",
                "required": false
            }
        ]
    },
    {
        "id": "monitoring",
        "name": "Post-Assistance Monitoring",
        "description": "Reported receipt, usefulness and remaining needs",
        "version": 1,
        "questions": [
            {
                "id": "q_monitoring_0",
                "label": "Assistance / case reference",
                "type": "text",
                "required": false
            },
            {
                "id": "q_monitoring_1",
                "label": "Assistance received as expected",
                "type": "yesno",
                "required": false
            },
            {
                "id": "q_monitoring_2",
                "label": "What was received and when",
                "type": "text",
                "required": false
            },
            {
                "id": "q_monitoring_3",
                "label": "Usefulness of assistance",
                "type": "choice",
                "required": false,
                "options": [
                    "Very useful",
                    "Somewhat useful",
                    "Not useful",
                    "Unable to assess"
                ]
            },
            {
                "id": "q_monitoring_4",
                "label": "Problems or feedback",
                "type": "text",
                "required": false
            },
            {
                "id": "q_monitoring_5",
                "label": "Remaining needs",
                "type": "text",
                "required": false
            }
        ]
    }
];
export function copyQuestions(qs) {
    const ids = new Map(qs.map(q => [q.id, 'q_' + crypto.randomUUID().replaceAll('-', '')]));
    return structuredClone(qs).map(q => ({ ...q, id: ids.get(q.id), ...(q.when ? { when: { ...q.when, question: ids.get(q.when.question) || q.when.question } } : {}), ...(q.after ? { after: ids.get(q.after) || q.after } : {}) }));
}
export function dependencyErrors(qs) {
    return qs.flatMap((q, i) => {
        const earlier = qs.slice(0, i), errors = [];
        if (q.when) {
            const parent = earlier.find(p => p.id === q.when.question);
            if (!parent || (parent.type !== 'yesno' && parent.type !== 'choice') || (parent.type === 'yesno' ? typeof q.when.equals !== 'boolean' : !parent.options?.includes(String(q.when.equals))))
                errors.push(`Question ${i + 1}: fix its show-only-when condition.`);
        }
        if (q.after && !earlier.some(p => p.id === q.after && p.type === 'date'))
            errors.push(`Question ${i + 1}: fix its date comparison.`);
        return errors;
    });
}
