--
-- PostgreSQL database dump
--

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO users (id, email, first_name, last_name, onboarding_complete, email_verified, created_at, deleted_at) VALUES ('8567b7dc-6049-415e-97d8-740a6483c1b6', 'benbalthes@gmail.com', 'Ben', 'Balthes', true, true, '2026-01-15 05:56:39.091809', NULL);


--
-- Data for Name: companies; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO companies (id, owner_user_id, name, primary_industry, company_size, location_count, how_heard, thank_you_message, created_at, deleted_at) VALUES ('02238978-8b23-408a-a5e4-a0399578229a', '8567b7dc-6049-415e-97d8-740a6483c1b6', 'Test Company', NULL, NULL, 3, NULL, NULL, '2026-01-15 05:56:49.03126', NULL);


--
-- Data for Name: locations; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO locations (id, company_id, name, is_active, state, country, google_business_url, created_at, updated_at, deleted_at) VALUES ('87ff1d9a-d62a-425f-a378-06bab8438eb7', '02238978-8b23-408a-a5e4-a0399578229a', 'Main Venue', true, NULL, NULL, NULL, '2026-01-15 05:56:49.03126', '2026-01-29 00:38:49.462858', NULL);


--
-- Data for Name: location_snapshots; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO location_snapshots (id, location_id, name, state, country, created_at, deleted_at) VALUES ('52462510-8dfc-4119-b8e2-fc0d9590bd4a', '87ff1d9a-d62a-425f-a378-06bab8438eb7', 'Main Venue', NULL, NULL, '2026-01-29 00:42:20.575835', NULL);
INSERT INTO location_snapshots (id, location_id, name, state, country, created_at, deleted_at) VALUES ('2afabdce-d226-4316-9ae8-68645824d638', '87ff1d9a-d62a-425f-a378-06bab8438eb7', 'Main Venue', NULL, NULL, '2026-01-29 00:48:38.136491', NULL);
INSERT INTO location_snapshots (id, location_id, name, state, country, created_at, deleted_at) VALUES ('b0c33b6b-7054-4fe8-b58b-4b0e68401795', '87ff1d9a-d62a-425f-a378-06bab8438eb7', 'Main Venue', NULL, NULL, '2026-01-29 00:50:31.850927', NULL);


--
-- Data for Name: surveys; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO surveys (id, company_id, name, status, latest_version, created_at, updated_at, deleted_at) VALUES ('3bf0df79-f109-4975-a40a-4f0bb4e128af', '02238978-8b23-408a-a5e4-a0399578229a', 'Survey 1', 'active', 3, '2026-01-27 05:17:51.882525', '2026-01-29 00:41:59.324489', NULL);


--
-- Data for Name: location_surveys; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO location_surveys (id, location_id, survey_id, is_active, start_date, end_date, created_at, updated_at, deleted_at) VALUES ('6491b89d-bba6-4226-878d-adbc585b3f5e', '87ff1d9a-d62a-425f-a378-06bab8438eb7', '3bf0df79-f109-4975-a40a-4f0bb4e128af', true, '2026-01-26 19:21:00', NULL, '2026-01-27 05:21:31.497525', '2026-01-29 00:42:13.820797', NULL);


--
-- Data for Name: qr_codes; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO qr_codes (id, company_id, title, is_active, location_survey_id, location_id, redirect_url, has_logo, created_at, updated_at, deleted_at) VALUES ('9b32692f-3ed4-4c48-89fa-f076b57e42c3', '02238978-8b23-408a-a5e4-a0399578229a', 'Main Venue QR Code 1', true, '6491b89d-bba6-4226-878d-adbc585b3f5e', '87ff1d9a-d62a-425f-a378-06bab8438eb7', 'http://localhost:3000/r/9b32692f-3ed4-4c48-89fa-f076b57e42c3', true, '2026-01-27 05:21:41.657327', '2026-01-27 05:21:41.657327', NULL);


--
-- Data for Name: scan_events; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO scan_events (id, qr_code_id, company_id, location_snapshot_id, scanned_at, ip_address, user_agent, session_id, deleted_at) VALUES ('52f49f2f-9811-4b72-a16c-22de243828bd', '9b32692f-3ed4-4c48-89fa-f076b57e42c3', '02238978-8b23-408a-a5e4-a0399578229a', 'b0c33b6b-7054-4fe8-b58b-4b0e68401795', '2026-01-29 00:50:31.850927', '172.21.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', '2de6ea9a-6ae1-4365-8293-8dbbdb71031a', NULL);


--
-- Data for Name: survey_versions; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO survey_versions (id, survey_id, version_number, schema_json, created_by, created_at, theme_settings, deleted_at) VALUES ('7efc9d9c-9b40-49cf-aa0b-efa9da6ac69b', '3bf0df79-f109-4975-a40a-4f0bb4e128af', 1, '{"theme": {"textColor": "#1E1E1E", "fontFamily": "Inter", "primaryColor": "#7C3AED", "backgroundColor": "#FFFFFF"}, "title": {"text": "Customer Feedback", "style": {"size": "h1"}}, "version": 1, "settings": {"contentAlign": "left", "showProgressBar": true, "progressBarColor": "#7C3AED"}, "subtitle": {"text": "Tell us about your experience", "style": {"size": "body"}}, "questions": []}', '8567b7dc-6049-415e-97d8-740a6483c1b6', '2026-01-27 05:17:51.882525', '{"font": "Inter", "primary_color": "#7C3AED", "background_color": "#FFFFFF", "content_alignment": "left", "show_progress_bar": true, "progress_bar_color": "#7C3AED"}', NULL);
INSERT INTO survey_versions (id, survey_id, version_number, schema_json, created_by, created_at, theme_settings, deleted_at) VALUES ('b73b405c-a8f0-4e76-ab9c-bc119fb10ac2', '3bf0df79-f109-4975-a40a-4f0bb4e128af', 2, '{"theme": {"textColor": "#1E1E1E", "fontFamily": "Inter", "primaryColor": "#7C3AED", "backgroundColor": "#FFFFFF"}, "title": {"text": "Customer Feedback", "style": {"size": "h1"}}, "version": 143, "settings": {"contentAlign": "left", "showProgressBar": true, "progressBarColor": "#7C3AED"}, "subtitle": {"text": "Tell us about your experience", "style": {"size": "body"}}, "questions": [{"id": "ca07b7a6-8ecd-4917-adad-97abda063a20", "type": "star", "title": {"text": "How would you rate your experience today?", "style": {"size": "h2"}}, "version": 52, "optional": false, "settings": {"optional": false, "starCount": 5, "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "89159a1b-7694-47ef-90cb-673aa24d465c", "type": "nps", "title": {"text": "How likely are you to recommend us?", "style": {"size": "h2"}}, "version": 50, "optional": false, "settings": {"optional": false, "max_label": "Extremely likely", "max_score": 10, "min_label": "Not likely", "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "1a942a63-9662-4c3f-96f1-6011f61834ca", "type": "text", "title": {"text": "Anything else you would like to add?", "style": {"size": "h2"}}, "version": 40, "optional": true, "settings": {"optional": false, "text_size": "medium", "placeholder": "Type your answer...", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}]}', '8567b7dc-6049-415e-97d8-740a6483c1b6', '2026-01-27 05:18:51.146895', '{"font": "Inter", "primary_color": "#7C3AED", "background_color": "#FFFFFF", "content_alignment": "left", "show_progress_bar": true, "progress_bar_color": "#7C3AED"}', NULL);
INSERT INTO survey_versions (id, survey_id, version_number, schema_json, created_by, created_at, theme_settings, deleted_at) VALUES ('c8894ef5-0110-46ad-a87f-52f7c40d7253', '3bf0df79-f109-4975-a40a-4f0bb4e128af', 3, '{"theme": {"textColor": "#1E1E1E", "fontFamily": "Inter", "primaryColor": "#7C3AED", "backgroundColor": "#FFFFFF"}, "title": {"text": "Test Survey", "style": {"size": "h1"}}, "version": 456, "settings": {"contentAlign": "center", "showProgressBar": true, "progressBarColor": "#7C3AED"}, "subtitle": {"text": "Welcome to the test survey", "style": {"size": "body"}}, "questions": [{"id": "61500049-eee2-4cad-b3ee-96e1a7716f21", "type": "checkbox", "title": {"text": "Checkbox question", "style": {"size": "h2"}}, "version": 24, "optional": false, "settings": {"options": ["Option 1", "Option 2", "Option 3", "Option 4"], "optional": false, "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "60e49982-c21b-46c7-9323-96502595f686", "type": "multiple_choice", "title": {"text": "Multiple Choice Question", "style": {"size": "h2"}}, "version": 35, "optional": false, "settings": {"options": ["Option 1", "Option 2", "Option 3", "Option 4"], "optional": false, "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "04e9cfa0-e8ae-42e7-9c8c-45b631f52e13", "type": "yes_no", "title": {"text": "Yes No Question", "style": {"size": "h2"}}, "version": 22, "optional": false, "settings": {"noLabel": "No", "optional": false, "yesLabel": "Yes", "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "ca5c6ec6-4233-42a4-b9a4-9cc369685f41", "type": "email", "title": {"text": "Email Question", "style": {"size": "h2"}}, "version": 17, "optional": false, "settings": {"optional": false, "text_size": "medium", "placeholder": "your@email.com", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "2146ed2c-10fe-4b9c-8b2f-03e136e34143", "type": "phone", "title": {"text": "Phone question", "style": {"size": "h2"}}, "version": 31, "optional": false, "settings": {"optional": false, "text_size": "medium", "placeholder": "+61 400 000 000", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "f0de0f8b-bf88-45c4-8d41-8d04757918a6", "type": "photo", "title": {"text": "Photo Question", "style": {"size": "h2"}}, "version": 18, "optional": false, "settings": {"optional": false, "text_size": "medium", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "12c660f0-d76f-4b00-ba2d-0e1d7f6e76ae", "type": "nps", "title": {"text": "NPS Question", "style": {"size": "h2"}}, "version": 37, "optional": false, "settings": {"optional": false, "max_label": "Extremely likely", "max_score": 10, "min_label": "Not likely", "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "8d959f1c-98bd-453d-be80-cda3a7065dde", "type": "star", "title": {"text": "Star Question", "style": {"size": "h2"}}, "version": 16, "optional": false, "settings": {"optional": false, "starCount": 5, "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "ddcf1769-d076-4c2c-a48c-409d2fda7692", "type": "long_text", "title": {"text": "Long Text Question", "style": {"size": "h2"}}, "version": 25, "optional": false, "settings": {"optional": false, "text_size": "medium", "placeholder": "Type your answer...", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}, {"id": "98421284-64f3-42f2-88e1-d5a9bd8ebbd9", "type": "text", "title": {"text": "Short text question", "style": {"size": "h2"}}, "version": 22, "optional": false, "settings": {"optional": false, "text_size": "medium", "placeholder": "Type your answer...", "title_alignment": "inherit", "action_alignment": "left"}, "description": {"text": "", "style": {"size": "body"}}}]}', '8567b7dc-6049-415e-97d8-740a6483c1b6', '2026-01-29 00:41:55.534767', '{"font": "Inter", "primary_color": "#7C3AED", "background_color": "#FFFFFF", "content_alignment": "center", "show_progress_bar": true, "progress_bar_color": "#7C3AED"}', NULL);


--
-- Data for Name: survey_sessions; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO survey_sessions (id, scan_id, survey_version_id, qr_code_id, company_id, location_snapshot_id, start_time, end_time, abandoned, device_type, browser, hashed_ip_address, deleted_at) VALUES ('2de6ea9a-6ae1-4365-8293-8dbbdb71031a', '52f49f2f-9811-4b72-a16c-22de243828bd', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', '9b32692f-3ed4-4c48-89fa-f076b57e42c3', '02238978-8b23-408a-a5e4-a0399578229a', 'b0c33b6b-7054-4fe8-b58b-4b0e68401795', '2026-01-29 00:50:31.850927', '2026-01-29 00:50:58.406115', false, 'desktop', 'chrome', 'fbd57f0145e15cc8436c042887ccaa6c', NULL);


--
-- Data for Name: survey_responses; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO survey_responses (id, survey_version_id, session_id, qr_code_id, location_snapshot_id, answers, completion_datetime, time_taken_seconds, device_type, browser, hashed_ip_address, deleted_at) VALUES ('9cf65c3b-296e-49e7-a6c1-038d67ee1773', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', '2de6ea9a-6ae1-4365-8293-8dbbdb71031a', '9b32692f-3ed4-4c48-89fa-f076b57e42c3', 'b0c33b6b-7054-4fe8-b58b-4b0e68401795', '{"04e9cfa0-e8ae-42e7-9c8c-45b631f52e13": "Yes", "12c660f0-d76f-4b00-ba2d-0e1d7f6e76ae": 9, "2146ed2c-10fe-4b9c-8b2f-03e136e34143": "+61 0422 840 929", "60e49982-c21b-46c7-9323-96502595f686": "Option 1", "61500049-eee2-4cad-b3ee-96e1a7716f21": ["Option 2", "Option 4"], "8d959f1c-98bd-453d-be80-cda3a7065dde": 5, "98421284-64f3-42f2-88e1-d5a9bd8ebbd9": "I really hate it here", "ca5c6ec6-4233-42a4-b9a4-9cc369685f41": "benbalthes@gmail.com", "ddcf1769-d076-4c2c-a48c-409d2fda7692": "I really love it here"}', '2026-01-29 00:50:58.406115', 26, 'desktop', 'chrome', 'fbd57f0145e15cc8436c042887ccaa6c', NULL);


--
-- Data for Name: ai_analysis; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO ai_analysis (id, company_id, location_id, survey_response_id, question_id, prompt, raw_response, analysis, sentiment, sentiment_score, model, model_version, analysis_version, status, processing_time_ms, error, created_at, deleted_at) VALUES ('6fd67c60-c09c-4f6b-8034-a5be2ac4195a', '02238978-8b23-408a-a5e4-a0399578229a', '87ff1d9a-d62a-425f-a378-06bab8438eb7', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '04a4029a-63f0-49b1-8c83-8eb66d87e69f', 'You are a strict sentiment classification engine.

Task:
Classify the sentiment of the user text.

Rules:
- Output ONLY a valid JSON object.
- Do NOT include markdown, explanations, or extra text.
- Do NOT include any keys other than ''sentiment'' and ''score''.
- ''sentiment'' must be exactly one of: positive, neutral, negative.
- ''score'' must be a number between -1 and 1.
- Use negative values for negative sentiment, positive values for positive sentiment.
- If the sentiment is mixed, unclear, or balanced, return ''neutral''.
- Keep the score proportional to strength (e.g., strong negative ≈ -0.8 to -1, mild ≈ -0.2).
- Always include both keys.
- Never return null.

Output format example:
{"sentiment": "neutral", "score": 0.0}
---
I really love it here', '"{\"sentiment\": \"positive\", \"score\": 0.9}"', '{"score": 0.9, "sentiment": "positive"}', 'positive', 0.9, 'gpt-4o-mini', NULL, 1, 'completed', 2706, NULL, '2026-01-29 00:51:00.500463', NULL);
INSERT INTO ai_analysis (id, company_id, location_id, survey_response_id, question_id, prompt, raw_response, analysis, sentiment, sentiment_score, model, model_version, analysis_version, status, processing_time_ms, error, created_at, deleted_at) VALUES ('827c773f-c07a-468f-ac2c-82b91bf1c296', '02238978-8b23-408a-a5e4-a0399578229a', '87ff1d9a-d62a-425f-a378-06bab8438eb7', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '43997ae4-d39b-46f3-b8dc-3129d9db5a39', 'You are a strict sentiment classification engine.

Task:
Classify the sentiment of the user text.

Rules:
- Output ONLY a valid JSON object.
- Do NOT include markdown, explanations, or extra text.
- Do NOT include any keys other than ''sentiment'' and ''score''.
- ''sentiment'' must be exactly one of: positive, neutral, negative.
- ''score'' must be a number between -1 and 1.
- Use negative values for negative sentiment, positive values for positive sentiment.
- If the sentiment is mixed, unclear, or balanced, return ''neutral''.
- Keep the score proportional to strength (e.g., strong negative ≈ -0.8 to -1, mild ≈ -0.2).
- Always include both keys.
- Never return null.

Output format example:
{"sentiment": "neutral", "score": 0.0}
---
I really hate it here', '"{\"sentiment\": \"negative\", \"score\": -0.9}"', '{"score": -0.9, "sentiment": "negative"}', 'negative', -0.9, 'gpt-4o-mini', NULL, 1, 'completed', 2264, NULL, '2026-01-29 00:51:03.26027', NULL);


--
-- Data for Name: flows; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO flows (id, company_id, name, description, is_active, status, broken_reasons, survey_id, created_at, updated_at, deleted_at) VALUES ('f1a7d3be-4d74-4e95-a647-96dc0e54a268', '02238978-8b23-408a-a5e4-a0399578229a', 'Check for negative review', NULL, true, 'active', '[]', '3bf0df79-f109-4975-a40a-4f0bb4e128af', '2026-01-27 05:22:31.155757', '2026-01-29 00:38:33.836316', '2026-01-29 00:38:33.836307');


--
-- Data for Name: flow_runs; Type: TABLE DATA; Schema: public; Owner: user_default
--



--
-- Data for Name: email_events; Type: TABLE DATA; Schema: public; Owner: user_default
--



--
-- Data for Name: flow_location_surveys; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO flow_location_surveys (id, flow_id, location_survey_id) VALUES ('5d7e64b7-835b-4edc-8a03-afc591a9808e', 'f1a7d3be-4d74-4e95-a647-96dc0e54a268', '6491b89d-bba6-4226-878d-adbc585b3f5e');


--
-- Data for Name: rules; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO rules (id, company_id, name, description, operator, survey_id, status, broken_reasons, created_at, updated_at, deleted_at) VALUES ('3ce94644-e658-429b-b64a-6ed6d0ae39f4', '02238978-8b23-408a-a5e4-a0399578229a', 'Poor Experience', 'Experience rating less than 3, or NPS less than 5, or negative text sentiment', 'OR', '3bf0df79-f109-4975-a40a-4f0bb4e128af', 'active', '[]', '2026-01-27 05:20:33.236423', '2026-01-29 00:38:37.981784', '2026-01-29 00:38:38.003366');


--
-- Data for Name: flow_nodes; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO flow_nodes (id, flow_id, parent_id, node_type, rule_id, branch_type, action_type, action_config, "position", created_at) VALUES ('89ddc043-613b-41ba-912c-3430228ae1e3', 'f1a7d3be-4d74-4e95-a647-96dc0e54a268', NULL, 'rule', '3ce94644-e658-429b-b64a-6ed6d0ae39f4', NULL, NULL, 'null', 0, '2026-01-27 05:22:31.155757');
INSERT INTO flow_nodes (id, flow_id, parent_id, node_type, rule_id, branch_type, action_type, action_config, "position", created_at) VALUES ('197d214e-e0b5-4d2c-a7d6-26a81c090308', 'f1a7d3be-4d74-4e95-a647-96dc0e54a268', '89ddc043-613b-41ba-912c-3430228ae1e3', 'branch', NULL, NULL, NULL, '{"match_type": "all", "rule_conditions": [{"rule_id": "3ce94644-e658-429b-b64a-6ed6d0ae39f4", "expected": true}]}', 1, '2026-01-27 05:22:31.155757');
INSERT INTO flow_nodes (id, flow_id, parent_id, node_type, rule_id, branch_type, action_type, action_config, "position", created_at) VALUES ('6433248c-7d5f-4c08-a05f-9c3518642bf1', 'f1a7d3be-4d74-4e95-a647-96dc0e54a268', '197d214e-e0b5-4d2c-a7d6-26a81c090308', 'action', NULL, 'TRUE', 'email', '{"target": "location_notification_groups"}', 2, '2026-01-27 05:22:31.155757');
INSERT INTO flow_nodes (id, flow_id, parent_id, node_type, rule_id, branch_type, action_type, action_config, "position", created_at) VALUES ('b1927031-aac3-4dc7-95b6-3fda92d1bc61', 'f1a7d3be-4d74-4e95-a647-96dc0e54a268', '197d214e-e0b5-4d2c-a7d6-26a81c090308', 'action', NULL, 'FALSE', 'redirect', '{"target": "google_business_url"}', 3, '2026-01-27 05:22:31.155757');


--
-- Data for Name: flow_run_actions; Type: TABLE DATA; Schema: public; Owner: user_default
--



--
-- Data for Name: notification_groups; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO notification_groups (id, company_id, name, created_at, updated_at, deleted_at) VALUES ('6a9b031b-be96-4a88-9568-34dccf998245', '02238978-8b23-408a-a5e4-a0399578229a', 'Poor reviews notification group', '2026-01-27 05:20:55.499181', '2026-01-29 00:38:53.226622', '2026-01-29 00:38:53.226622');


--
-- Data for Name: location_notification_groups; Type: TABLE DATA; Schema: public; Owner: user_default
--



--
-- Data for Name: notification_group_members; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO notification_group_members (id, group_id, name, email, created_at, deleted_at) VALUES ('1cac56d8-47e2-4b35-bcc2-13e06f5bc424', '6a9b031b-be96-4a88-9568-34dccf998245', 'Ben 2', 'benbalthess@gmail.com', '2026-01-27 05:20:55.522992', '2026-01-29 00:38:53.226622');
INSERT INTO notification_group_members (id, group_id, name, email, created_at, deleted_at) VALUES ('62630fa2-78cc-47d1-81a4-a37fe973b758', '6a9b031b-be96-4a88-9568-34dccf998245', 'Ben 1', 'benbalthes@gmail.com', '2026-01-27 05:20:55.522992', '2026-01-29 00:38:53.226622');


--
-- Data for Name: qr_code_assets; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO qr_code_assets (id, qr_code_id, format, storage_path, public_url, created_at) VALUES ('ca7d0afe-71c5-45f1-ba66-5ae343b38796', '9b32692f-3ed4-4c48-89fa-f076b57e42c3', 'svg', '9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.svg', 'https://hriennuneldnfctmvjbu.supabase.co/storage/v1/object/public/qr_codes/9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.svg', '2026-01-27 05:21:41.657327');
INSERT INTO qr_code_assets (id, qr_code_id, format, storage_path, public_url, created_at) VALUES ('1eb01e44-203a-489a-ab32-e21ab7195038', '9b32692f-3ed4-4c48-89fa-f076b57e42c3', 'png', '9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.png', 'https://hriennuneldnfctmvjbu.supabase.co/storage/v1/object/public/qr_codes/9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.png', '2026-01-27 05:21:41.657327');
INSERT INTO qr_code_assets (id, qr_code_id, format, storage_path, public_url, created_at) VALUES ('d1161adf-0d3d-4bd8-b600-45c74949fd5b', '9b32692f-3ed4-4c48-89fa-f076b57e42c3', 'jpeg', '9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.jpeg', 'https://hriennuneldnfctmvjbu.supabase.co/storage/v1/object/public/qr_codes/9b32692f-3ed4-4c48-89fa-f076b57e42c3/qr.jpeg', '2026-01-27 05:21:41.657327');



--
-- Data for Name: questions; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('7fd86603-d3b0-41a1-879f-803f68474f2c', 'b2644512-4db1-429c-a433-93549285ba20', 'b73b405c-a8f0-4e76-ab9c-bc119fb10ac2', 'ca07b7a6-8ecd-4917-adad-97abda063a20', 'How would you rate your experience today?', 'star', '{"optional": false, "starCount": 5, "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}', 0, true, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('934f5d3c-89f2-4d5b-9d9a-ed91220910c5', '3707bc0f-558f-48a7-afd7-b205eb26ca47', 'b73b405c-a8f0-4e76-ab9c-bc119fb10ac2', '89159a1b-7694-47ef-90cb-673aa24d465c', 'How likely are you to recommend us?', 'nps', '{"optional": false, "max_label": "Extremely likely", "max_score": 10, "min_label": "Not likely", "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}', 1, true, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('edf8937b-473f-4005-acb1-0c2dfbba75dc', 'ffea322b-be78-4e65-b282-3e7ea72ecf92', 'b73b405c-a8f0-4e76-ab9c-bc119fb10ac2', '1a942a63-9662-4c3f-96f1-6011f61834ca', 'Anything else you would like to add?', 'text', '{"optional": false, "text_size": "medium", "placeholder": "Type your answer...", "title_alignment": "inherit", "action_alignment": "left"}', 2, false, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('9cc4370c-1d58-4c7f-bf5d-b4aeb95eae1c', '84d7fec3-f459-44cf-b289-455b98aaf6ad', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', '61500049-eee2-4cad-b3ee-96e1a7716f21', 'Checkbox question', 'checkbox', '{"options": ["Option 1", "Option 2", "Option 3", "Option 4"], "optional": false, "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}', 0, false, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('0c97eb8f-b997-4e7c-923f-33c0901c3dcf', 'b9babcf9-80ae-4d0d-a9fb-4fdb9686ef82', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', '60e49982-c21b-46c7-9323-96502595f686', 'Multiple Choice Question', 'multiple_choice', '{"options": ["Option 1", "Option 2", "Option 3", "Option 4"], "optional": false, "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}', 1, false, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('3e86a12e-1798-4616-90e2-b3843f447430', '6fbf5ea7-a97f-45c9-83bc-2a751a24bbdc', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', '04e9cfa0-e8ae-42e7-9c8c-45b631f52e13', 'Yes No Question', 'yes_no', '{"noLabel": "No", "optional": false, "yesLabel": "Yes", "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}', 2, false, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('8330c1f6-192f-4125-b7f8-25d3f973c5e1', 'f584028c-9614-4181-a236-da31d268ae8d', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', 'ca5c6ec6-4233-42a4-b9a4-9cc369685f41', 'Email Question', 'email', '{"optional": false, "text_size": "medium", "placeholder": "your@email.com", "title_alignment": "inherit", "action_alignment": "left"}', 3, false, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('3eb3c283-c349-4124-b03d-e7027880db1b', '6afaa181-0897-4a3f-b9d8-f5bdcf53df80', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', '2146ed2c-10fe-4b9c-8b2f-03e136e34143', 'Phone question', 'phone', '{"optional": false, "text_size": "medium", "placeholder": "+61 400 000 000", "title_alignment": "inherit", "action_alignment": "left"}', 4, false, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('0f5bc194-d5f9-4fbf-bb3d-451460347db0', '348b0939-a00a-43e5-8e2b-e8a9afa53191', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', 'f0de0f8b-bf88-45c4-8d41-8d04757918a6', 'Photo Question', 'photo', '{"optional": false, "text_size": "medium", "title_alignment": "inherit", "action_alignment": "left"}', 5, false, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('246a1121-fc1d-4620-9453-fba208e4ea6f', 'b991924d-e1a3-45c1-93cb-a8bc97e3d532', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', '12c660f0-d76f-4b00-ba2d-0e1d7f6e76ae', 'NPS Question', 'nps', '{"optional": false, "max_label": "Extremely likely", "max_score": 10, "min_label": "Not likely", "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}', 6, true, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('4660a3a3-a83d-4e40-9813-6e9d3a5aa161', '09cf0639-88c3-4b13-9040-a4c9c023f84e', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', '8d959f1c-98bd-453d-be80-cda3a7065dde', 'Star Question', 'star', '{"optional": false, "starCount": 5, "text_size": "medium", "selected_colour": "#7C3AED", "title_alignment": "inherit", "action_alignment": "left"}', 7, true, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('b3ca04c7-8bd3-41c5-ba21-9000c4385b82', '04a4029a-63f0-49b1-8c83-8eb66d87e69f', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', 'ddcf1769-d076-4c2c-a48c-409d2fda7692', 'Long Text Question', 'long_text', '{"optional": false, "text_size": "medium", "placeholder": "Type your answer...", "title_alignment": "inherit", "action_alignment": "left"}', 8, false, NULL);
INSERT INTO questions (id, stable_question_id, survey_version_id, question_key, question_text, question_type, config, "position", is_numeric, deleted_at) VALUES ('db1b21f3-9b98-494b-bb7c-b1e79ce64a3c', '43997ae4-d39b-46f3-b8dc-3129d9db5a39', 'c8894ef5-0110-46ad-a87f-52f7c40d7253', '98421284-64f3-42f2-88e1-d5a9bd8ebbd9', 'Short text question', 'text', '{"optional": false, "text_size": "medium", "placeholder": "Type your answer...", "title_alignment": "inherit", "action_alignment": "left"}', 9, false, NULL);


--
-- Data for Name: redirect_confirmations; Type: TABLE DATA; Schema: public; Owner: user_default
--



--
-- Data for Name: response_reads; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO response_reads (id, user_id, response_id, read_at, deleted_at) VALUES ('f6dc31da-be7a-4241-bea6-7b635e195099', '8567b7dc-6049-415e-97d8-740a6483c1b6', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '2026-01-29 00:52:19.562154', NULL);


--
-- Data for Name: rule_groups; Type: TABLE DATA; Schema: public; Owner: user_default
--



--
-- Data for Name: rule_conditions; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO rule_conditions (id, rule_id, condition_type, question_id, operator, value, group_id, created_at, updated_at, deleted_at) VALUES ('10f0e9f4-3c9a-4521-af58-c7c0d32d4f4f', '3ce94644-e658-429b-b64a-6ed6d0ae39f4', 'rating', 'b2644512-4db1-429c-a433-93549285ba20', 'lt', '3', NULL, '2026-01-27 05:20:33.236423', '2026-01-29 00:38:37.981784', '2026-01-29 00:38:38.003366');
INSERT INTO rule_conditions (id, rule_id, condition_type, question_id, operator, value, group_id, created_at, updated_at, deleted_at) VALUES ('54113335-740b-47ad-9216-0d34eace8ec1', '3ce94644-e658-429b-b64a-6ed6d0ae39f4', 'sentiment', 'ffea322b-be78-4e65-b282-3e7ea72ecf92', 'is', 'negative', NULL, '2026-01-27 05:20:33.236423', '2026-01-29 00:38:37.981784', '2026-01-29 00:38:38.003366');
INSERT INTO rule_conditions (id, rule_id, condition_type, question_id, operator, value, group_id, created_at, updated_at, deleted_at) VALUES ('ace15df7-59a6-4165-b722-4b45d069fb7e', '3ce94644-e658-429b-b64a-6ed6d0ae39f4', 'nps', '3707bc0f-558f-48a7-afd7-b205eb26ca47', 'lt', '5', NULL, '2026-01-27 05:20:33.236423', '2026-01-29 00:38:37.981784', '2026-01-29 00:38:38.003366');


--
-- Data for Name: survey_redirect_idempotency; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO survey_redirect_idempotency (idempotency_key, scan_id, session_id, redirect_url, created_at, deleted_at) VALUES ('b53f26ec-10f1-485e-b160-9b4ab752a09b', '52f49f2f-9811-4b72-a16c-22de243828bd', '2de6ea9a-6ae1-4365-8293-8dbbdb71031a', 'http://localhost:3000/survey?session=2de6ea9a-6ae1-4365-8293-8dbbdb71031a&qr=9b32692f-3ed4-4c48-89fa-f076b57e42c3', '2026-01-29 00:50:31.850927', NULL);


--
-- Data for Name: survey_response_answers; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO survey_response_answers (id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ('679c1ec6-2d01-4f10-9cdb-7fbd172a950a', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '84d7fec3-f459-44cf-b289-455b98aaf6ad', 'Option 2, Option 4', NULL, '2026-01-29 00:50:58.405109', NULL);
INSERT INTO survey_response_answers (id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ('ba9bb854-895b-4b4c-8f33-6ba663909a12', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', 'b9babcf9-80ae-4d0d-a9fb-4fdb9686ef82', 'Option 1', NULL, '2026-01-29 00:50:58.405109', NULL);
INSERT INTO survey_response_answers (id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ('98f434dd-d956-469c-b478-4745e330bfab', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '6fbf5ea7-a97f-45c9-83bc-2a751a24bbdc', 'Yes', NULL, '2026-01-29 00:50:58.405109', NULL);
INSERT INTO survey_response_answers (id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ('63b71d05-db53-41ad-986a-9fa167409d5b', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', 'f584028c-9614-4181-a236-da31d268ae8d', 'benbalthes@gmail.com', NULL, '2026-01-29 00:50:58.405109', NULL);
INSERT INTO survey_response_answers (id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ('9131f929-fae3-4441-bb29-8ba62264f2e3', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '6afaa181-0897-4a3f-b9d8-f5bdcf53df80', '+61 0422 840 929', NULL, '2026-01-29 00:50:58.405109', NULL);
INSERT INTO survey_response_answers (id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ('1335835d-e0ce-4bd6-bbf6-daa0a1655fd3', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', 'b991924d-e1a3-45c1-93cb-a8bc97e3d532', NULL, 9, '2026-01-29 00:50:58.405109', NULL);
INSERT INTO survey_response_answers (id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ('645245cd-f76b-41db-9528-958626c4a0ab', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '09cf0639-88c3-4b13-9040-a4c9c023f84e', NULL, 5, '2026-01-29 00:50:58.405109', NULL);
INSERT INTO survey_response_answers (id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ('8dda0a0b-ae60-4f6f-8494-9858b6c0f701', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '04a4029a-63f0-49b1-8c83-8eb66d87e69f', 'I really love it here', NULL, '2026-01-29 00:50:58.405109', NULL);
INSERT INTO survey_response_answers (id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ('3b1df93a-4184-4090-a2d1-0b6992c3eaa3', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '43997ae4-d39b-46f3-b8dc-3129d9db5a39', 'I really hate it here', NULL, '2026-01-29 00:50:58.405109', NULL);
INSERT INTO survey_response_answers (id, survey_response_id, question_id, text_value, numeric_value, created_at, deleted_at) VALUES ('6eee3267-7bc5-4691-ac99-1c668ba6207f', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '348b0939-a00a-43e5-8e2b-e8a9afa53191', '9cf65c3b-296e-49e7-a6c1-038d67ee1773/f0de0f8b-bf88-45c4-8d41-8d04757918a6.png', NULL, '2026-01-29 00:50:59.501086', NULL);


--
-- Data for Name: survey_response_photos; Type: TABLE DATA; Schema: public; Owner: user_default
--

INSERT INTO survey_response_photos (id, survey_response_id, question_id, storage_path, mime_type, file_size_bytes, created_at) VALUES ('cba6c78d-2092-46a4-b9f4-022d21ce48c6', '9cf65c3b-296e-49e7-a6c1-038d67ee1773', '348b0939-a00a-43e5-8e2b-e8a9afa53191', '9cf65c3b-296e-49e7-a6c1-038d67ee1773/f0de0f8b-bf88-45c4-8d41-8d04757918a6.png', 'image/png', 104822, '2026-01-29 00:50:59.501086+00');


--
-- PostgreSQL database dump complete
--

INSERT INTO subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, status, trial_end, current_period_end, created_at, updated_at) VALUES ("ff30861e-9173-466d-919f-4518a32696cc", "8567b7dc-6049-415e-97d8-740a6483c1b6", "cus_UF02MbFCg8u8i4", "sub_1TGW2QByUVVeu9caV8xXGrYq", "trialing", "2026-04-06 02:58:48", "2026-03-30 02:58:30.701676", "2026-03-30 02:58:53.137566");