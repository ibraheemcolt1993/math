# Database Schema Reference

> Source: user-provided table/column summary for the Math app database.

## AssessmentQuestionChoices

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| AssessmentChoiceId | int |  | NO |
| AssessmentQuestionId | int |  | NO |
| SortOrder | int |  | NO |
| ChoiceText | nvarchar | 300 | NO |

## AssessmentQuestions

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| AssessmentQuestionId | int |  | NO |
| AssessmentId | int |  | NO |
| SortOrder | int |  | NO |
| QuestionType | nvarchar | 50 | NO |
| QuestionText | nvarchar | 500 | NO |
| Answer | nvarchar | 200 | YES |
| Points | int |  | NO |
| CorrectIndex | int |  | YES |
| IsRequired | bit |  | NO |
| DataJson | nvarchar | max | YES |
| ValidationJson | nvarchar | max | YES |

## Assessments

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| AssessmentId | int |  | NO |
| Week | int |  | NO |
| Title | nvarchar | 300 | NO |
| Description | nvarchar | 500 | NO |

## CardCompletions

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| CompletionId | int |  | NO |
| StudentId | nvarchar | 20 | NO |
| Week | int |  | NO |
| FinalScore | int |  | NO |
| CompletedAt | datetime |  | NO |

## Cards

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| Week | int |  | NO |
| Title | nvarchar | 300 | NO |
| PrereqWeek | int |  | YES |

## Concepts

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| ConceptId | int |  | NO |
| Week | int |  | NO |
| SortOrder | int |  | NO |
| Title | nvarchar | 300 | NO |

## database_firewall_rules

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| id | int |  | NO |
| name | nvarchar | 128 | NO |
| start_ip_address | varchar | 45 | NO |
| end_ip_address | varchar | 45 | NO |
| create_date | datetime |  | NO |
| modify_date | datetime |  | NO |

## FlowItemChoices

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| FlowItemChoiceId | int |  | NO |
| FlowItemId | int |  | NO |
| SortOrder | int |  | NO |
| ChoiceText | nvarchar | 300 | NO |

## FlowItemDetails

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| FlowItemDetailId | int |  | NO |
| FlowItemId | int |  | NO |
| SortOrder | int |  | NO |
| DetailText | nvarchar | 500 | NO |

## FlowItemHints

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| FlowItemHintId | int |  | NO |
| FlowItemId | int |  | NO |
| SortOrder | int |  | NO |
| HintText | nvarchar | 500 | NO |

## FlowItems

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| FlowItemId | int |  | NO |
| ConceptId | int |  | NO |
| SortOrder | int |  | NO |
| ItemType | nvarchar | 50 | NO |
| ItemText | nvarchar | 1000 | YES |
| ItemTitle | nvarchar | 300 | YES |
| ItemDescription | nvarchar | 500 | YES |
| ItemUrl | nvarchar | 500 | YES |
| Answer | nvarchar | 200 | YES |
| CorrectIndex | int |  | YES |
| Solution | nvarchar | 1000 | YES |
| IsRequired | bit |  | NO |
| DataJson | nvarchar | max | YES |
| ValidationJson | nvarchar | max | YES |

## Students

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| StudentId | nvarchar | 20 | NO |
| BirthYear | nvarchar | 10 | NO |
| FirstName | nvarchar | 100 | NO |
| FullName | nvarchar | 200 | NO |
| Class | nvarchar | 20 | NO |

## WeekGoals

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| GoalId | int |  | NO |
| Week | int |  | NO |
| SortOrder | int |  | NO |
| GoalText | nvarchar | 500 | NO |

## WeekPrerequisites

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| PrerequisiteId | int |  | NO |
| Week | int |  | NO |
| SortOrder | int |  | NO |
| PrerequisiteText | nvarchar | 500 | NO |

## Weeks

| Column | Type | Max Length | Nullable |
| --- | --- | --- | --- |
| Week | int |  | NO |
| Title | nvarchar | 300 | NO |
